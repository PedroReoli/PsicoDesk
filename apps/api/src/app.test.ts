import { createHash, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AcknowledgeBatch, CreateBatch, SyncPush } from '@psicodesk/sync-protocol';
import { buildApp } from './app.js';
import type { StorageAdapter } from './adapters/storage/contract.js';
import { errors } from './domain/errors.js';
import type { DeviceIdentity, PullOutcome, PushOutcome, StoredBatch } from './domain/types.js';
import type {
  AuthRepository,
  BatchRepository,
  HealthRepository,
  SyncRepository,
} from './repositories/contracts.js';
import { AuthService } from './services/auth-service.js';
import { BatchService } from './services/batch-service.js';
import { RealtimeHub } from './services/realtime-hub.js';
import { SyncService } from './services/sync-service.js';
import { UploadService } from './services/upload-service.js';

const clinicId = '10000000-0000-4000-8000-000000000001';
const originDeviceId = '20000000-0000-4000-8000-000000000001';
const targetDeviceId = '20000000-0000-4000-8000-000000000002';
const otherClinicId = '10000000-0000-4000-8000-000000000002';
const otherDeviceId = '20000000-0000-4000-8000-000000000003';
const deviceSecret = 'device-secret-with-at-least-32-characters';
const pepper = 'pepper-with-at-least-thirty-two-characters';
const allScopes = [
  'batches:read',
  'batches:write',
  'sync:read',
  'sync:write',
  'uploads:write',
  'realtime:connect',
] as const;

class FakeAuthRepository implements AuthRepository {
  devices = new Map<string, DeviceIdentity>();
  async findDevice(clinic: string, device: string) {
    return this.devices.get(`${clinic}:${device}`) ?? null;
  }
  async touchDevice() {}
}

class FakeBatchRepository implements BatchRepository {
  batches = new Map<string, StoredBatch>();
  keys = new Map<string, { batchId: string; hash: string }>();

  async create(clinic: string, key: string, input: CreateBatch, payload: Uint8Array) {
    const existing = this.keys.get(`${clinic}:${key}`);
    if (existing) {
      if (existing.hash !== input.contentHash || existing.batchId !== input.batchId)
        throw errors.conflict('Chave idempotente reutilizada com conteúdo diferente.');
      return { batch: this.batches.get(existing.batchId)!, created: false };
    }
    const batch: StoredBatch = {
      ...input,
      clinicId: clinic,
      status: 'pending',
      receivedAt: new Date().toISOString(),
      acknowledgedAt: null,
      payload,
      idempotencyKey: key,
    };
    this.batches.set(input.batchId, batch);
    this.keys.set(`${clinic}:${key}`, { batchId: input.batchId, hash: input.contentHash });
    return { batch, created: true };
  }

  async findMetadata(clinic: string, device: string, batchId: string) {
    const batch = this.batches.get(batchId);
    return batch?.clinicId === clinic &&
      (batch.originDeviceId === device || batch.targetDeviceId === device)
      ? batch
      : null;
  }
  async findPayload(clinic: string, device: string, batchId: string) {
    const batch = this.batches.get(batchId);
    return batch?.clinicId === clinic && batch.targetDeviceId === device ? batch : null;
  }
  async acknowledge(clinic: string, device: string, batchId: string, input: AcknowledgeBatch) {
    const batch = await this.findPayload(clinic, device, batchId);
    if (!batch) return null;
    batch.status = input.status;
    batch.acknowledgedAt = input.importedAt;
    return batch;
  }
  async softDelete(clinic: string, device: string, batchId: string) {
    const batch = this.batches.get(batchId);
    if (batch?.clinicId !== clinic || batch.originDeviceId !== device) return false;
    batch.status = 'deleted';
    return true;
  }
}

class FakeSyncRepository implements SyncRepository {
  async push(_clinic: string, _device: string, input: SyncPush): Promise<PushOutcome> {
    return {
      acceptedChangeIds: input.changes.map((change) => change.changeId),
      conflicts: [],
      cursor: '1',
    };
  }
  async pull(): Promise<PullOutcome> {
    return { changes: [], nextCursor: '0', hasMore: false };
  }
}

class FakeStorage implements StorageAdapter {
  async createUploadUrl(input: {
    key: string;
    mimeType: string;
    sizeBytes: number;
    expiresInSeconds: number;
  }) {
    return {
      key: input.key,
      url: 'https://storage.invalid/upload',
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1_000).toISOString(),
      requiredHeaders: { 'content-type': input.mimeType },
    };
  }
  async createDownloadUrl() {
    return { url: 'https://storage.invalid/download', expiresAt: new Date().toISOString() };
  }
}

describe('PsicoDesk API', () => {
  let app: FastifyInstance;
  let originToken: string;
  let targetToken: string;
  let otherClinicToken: string;
  let readinessFails: boolean;

  beforeEach(async () => {
    const authRepository = new FakeAuthRepository();
    const authService = new AuthService(authRepository, pepper);
    for (const deviceId of [originDeviceId, targetDeviceId]) {
      authRepository.devices.set(`${clinicId}:${deviceId}`, {
        clinicId,
        deviceId,
        secretHash: authService.hashSecret(deviceSecret),
        status: 'active',
        scopes: allScopes,
      });
    }
    authRepository.devices.set(`${otherClinicId}:${otherDeviceId}`, {
      clinicId: otherClinicId,
      deviceId: otherDeviceId,
      secretHash: authService.hashSecret(deviceSecret),
      status: 'active',
      scopes: allScopes,
    });
    readinessFails = false;
    app = await buildApp({
      jwtSecret: 'jwt-secret-with-at-least-thirty-two-characters',
      healthRepository: {
        ping: async () => {
          if (readinessFails) throw new Error('database unavailable');
          return true;
        },
      } satisfies HealthRepository,
      authService,
      batchService: new BatchService(new FakeBatchRepository()),
      syncService: new SyncService(new FakeSyncRepository()),
      uploadService: new UploadService(new FakeStorage()),
      realtime: new RealtimeHub(),
      logger: false,
    });
    originToken = await tokenFor(originDeviceId);
    targetToken = await tokenFor(targetDeviceId);
    otherClinicToken = await tokenFor(otherDeviceId, otherClinicId);
  });

  afterEach(async () => app.close());

  async function tokenFor(deviceId: string, tokenClinicId = clinicId): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/token',
      payload: { clinicId: tokenClinicId, deviceId, deviceSecret },
    });
    expect(response.statusCode).toBe(200);
    return response.json<{ accessToken: string }>().accessToken;
  }

  it('expõe liveness, readiness e OpenAPI', async () => {
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/ready' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/documentation/json' })).json().openapi).toBe(
      '3.0.3',
    );
    readinessFails = true;
    expect((await app.inject({ method: 'GET', url: '/ready' })).statusCode).toBe(503);
  });

  it('protege rotas e mantém criação de carga idempotente', async () => {
    expect(
      (await app.inject({ method: 'GET', url: `/v1/batches/${randomUUID()}` })).statusCode,
    ).toBe(401);
    const payload = Buffer.from('encrypted opaque bytes');
    const batch = makeBatch(payload);
    const headers = {
      authorization: `Bearer ${originToken}`,
      'idempotency-key': 'idempotency-key-0001',
    };
    expect(
      (await app.inject({ method: 'POST', url: '/v1/batches', headers, payload: batch }))
        .statusCode,
    ).toBe(201);
    expect(
      (await app.inject({ method: 'POST', url: '/v1/batches', headers, payload: batch }))
        .statusCode,
    ).toBe(200);
    const conflicting = { ...batch, batchId: randomUUID() };
    expect(
      (await app.inject({ method: 'POST', url: '/v1/batches', headers, payload: conflicting }))
        .statusCode,
    ).toBe(409);
  });

  it('permite baixar payload somente no dispositivo destinatário', async () => {
    const payload = Buffer.from('ciphertext');
    const batch = makeBatch(payload);
    await app.inject({
      method: 'POST',
      url: '/v1/batches',
      headers: {
        authorization: `Bearer ${originToken}`,
        'idempotency-key': 'idempotency-key-0002',
      },
      payload: batch,
    });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/v1/batches/${batch.batchId}/payload`,
          headers: { authorization: `Bearer ${originToken}` },
        })
      ).statusCode,
    ).toBe(404);
    const downloaded = await app.inject({
      method: 'GET',
      url: `/v1/batches/${batch.batchId}/payload`,
      headers: { authorization: `Bearer ${targetToken}` },
    });
    expect(downloaded.statusCode).toBe(200);
    expect(downloaded.json().payloadBase64).toBe(payload.toString('base64'));
    const crossTenant = await app.inject({
      method: 'GET',
      url: `/v1/batches/${batch.batchId}`,
      headers: { authorization: `Bearer ${otherClinicToken}` },
    });
    expect(crossTenant.statusCode).toBe(404);
  });

  it('rejeita nomes e MIME perigosos antes de presignar', async () => {
    const authorization = `Bearer ${originToken}`;
    const invalid = await app.inject({
      method: 'POST',
      url: '/v1/uploads/presign',
      headers: { authorization },
      payload: {
        fileName: '../record.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        purpose: 'document',
      },
    });
    expect(invalid.statusCode).toBe(400);
    const valid = await app.inject({
      method: 'POST',
      url: '/v1/uploads/presign',
      headers: { authorization },
      payload: {
        fileName: 'record.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        purpose: 'document',
      },
    });
    expect(valid.statusCode).toBe(200);
    expect(valid.json().key).toMatch(new RegExp(`^clinics/${clinicId}/document/`));
  });
});

function makeBatch(payload: Buffer): CreateBatch {
  const now = new Date();
  return {
    schemaVersion: 1,
    batchId: randomUUID(),
    originDeviceId,
    targetDeviceId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    contentHash: createHash('sha256').update(payload).digest('hex'),
    signature: 'a'.repeat(64),
    encryption: { algorithm: 'xchacha20-poly1305', keyId: 'key-1', nonce: 'b'.repeat(24) },
    payloadBase64: payload.toString('base64'),
  };
}
