import { createHash, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CreateBatch } from '@psicodesk/sync-protocol';
import { buildDeterministicTestApp, deterministicFixture } from './testing/test-app.js';

describe('PsicoDesk API canônica', () => {
  let built: Awaited<ReturnType<typeof buildDeterministicTestApp>>;
  let senderToken: string;
  let receiverToken: string;
  let otherToken: string;

  beforeEach(async () => {
    built = await buildDeterministicTestApp();
    senderToken = await tokenFor(
      deterministicFixture.clinicId,
      deterministicFixture.senderDeviceId,
    );
    receiverToken = await tokenFor(
      deterministicFixture.clinicId,
      deterministicFixture.receiverDeviceId,
    );
    otherToken = await tokenFor(
      deterministicFixture.otherClinicId,
      deterministicFixture.otherDeviceId,
    );
  });

  afterEach(async () => built.app.close());

  async function tokenFor(clinicId: string, deviceId: string): Promise<string> {
    const response = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/token',
      payload: { clinicId, deviceId, deviceSecret: deterministicFixture.deviceSecret },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().tokenType).toBe('Bearer');
    return response.json<{ accessToken: string }>().accessToken;
  }

  it('expõe health, readiness e OpenAPI fiel', async () => {
    expect((await built.app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    expect((await built.app.inject({ method: 'GET', url: '/ready' })).statusCode).toBe(200);
    built.repositories.health.available = false;
    expect((await built.app.inject({ method: 'GET', url: '/ready' })).statusCode).toBe(503);
    const openApi = await built.app.inject({ method: 'GET', url: '/documentation/json' });
    expect(openApi.statusCode).toBe(200);
    expect(openApi.json().paths['/v1/batches']).toBeDefined();
    expect(openApi.json().paths['/v1/realtime/ticket']).toBeDefined();
  });

  it('registra dispositivo uma vez e autentica sem receber chave clínica', async () => {
    const payload = {
      clinicId: deterministicFixture.clinicId,
      enrollmentToken: deterministicFixture.enrollmentToken,
      deviceName: 'Novo dispositivo',
      signingPublicKey: Buffer.alloc(32, 4).toString('base64'),
    };
    const registered = await built.app.inject({
      method: 'POST',
      url: '/v1/devices/register',
      payload,
    });
    expect(registered.statusCode).toBe(201);
    expect(registered.json()).not.toHaveProperty('syncKey');
    expect(registered.json().deviceId).toBe(deterministicFixture.registeredDeviceId);
    expect(
      (await built.app.inject({ method: 'POST', url: '/v1/devices/register', payload })).statusCode,
    ).toBe(401);
    const token = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/token',
      payload: {
        clinicId: deterministicFixture.clinicId,
        deviceId: deterministicFixture.registeredDeviceId,
        deviceSecret: deterministicFixture.registeredDeviceSecret,
      },
    });
    expect(token.statusCode).toBe(200);
  });

  it('lista somente peers da clínica e exige token válido', async () => {
    expect((await built.app.inject({ method: 'GET', url: '/v1/devices/peers' })).statusCode).toBe(
      401,
    );
    const peers = await built.app.inject({
      method: 'GET',
      url: '/v1/devices/peers',
      headers: bearer(senderToken),
    });
    expect(peers.statusCode).toBe(200);
    expect(peers.json().peers).toEqual([
      expect.objectContaining({ deviceId: deterministicFixture.receiverDeviceId }),
    ]);
    expect(JSON.stringify(peers.json())).not.toContain(deterministicFixture.otherDeviceId);
    const invalidToken = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/token',
      payload: {
        clinicId: deterministicFixture.clinicId,
        deviceId: deterministicFixture.senderDeviceId,
        deviceSecret: 'wrong-device-secret-with-at-least-32-chars',
      },
    });
    expect(invalidToken.statusCode).toBe(401);
  });

  it('transporta batch opaco sender→receiver, pagina, baixa e confirma', async () => {
    const ciphertext = Buffer.from('opaque-ciphertext-and-gcm-tag');
    const batch = makeBatch(ciphertext);
    const headers = { ...bearer(senderToken), 'idempotency-key': 'batch-e2e-idempotency-0001' };
    const created = await built.app.inject({
      method: 'POST',
      url: '/v1/batches',
      headers,
      payload: batch,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).not.toHaveProperty('payloadBase64');
    expect(
      (await built.app.inject({ method: 'POST', url: '/v1/batches', headers, payload: batch }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await built.app.inject({
          method: 'GET',
          url: '/v1/batches?cursor=0',
          headers: bearer(senderToken),
        })
      ).json().items,
    ).toHaveLength(0);
    const receiverList = await built.app.inject({
      method: 'GET',
      url: '/v1/batches?cursor=0&limit=1',
      headers: bearer(receiverToken),
    });
    expect(receiverList.json().items[0]).toMatchObject({
      batchId: batch.batchId,
      targetDeviceId: deterministicFixture.receiverDeviceId,
      status: 'pending',
      deliveryCursor: '1',
    });
    expect(
      (
        await built.app.inject({
          method: 'GET',
          url: `/v1/batches/${batch.batchId}/payload`,
          headers: bearer(senderToken),
        })
      ).statusCode,
    ).toBe(404);
    const downloaded = await built.app.inject({
      method: 'GET',
      url: `/v1/batches/${batch.batchId}/payload`,
      headers: bearer(receiverToken),
    });
    expect(downloaded.json()).toEqual({
      payloadBase64: ciphertext.toString('base64'),
      contentHash: batch.contentHash,
    });
    const ack = await built.app.inject({
      method: 'POST',
      url: `/v1/batches/${batch.batchId}/ack`,
      headers: bearer(receiverToken),
      payload: { status: 'applied', importedAt: deterministicFixture.now },
    });
    expect(ack.statusCode).toBe(200);
    expect(ack.json()).toMatchObject({ batchId: batch.batchId, status: 'applied' });
    expect(ack.json()).not.toHaveProperty('payloadBase64');
    expect(
      (
        await built.app.inject({
          method: 'POST',
          url: `/v1/batches/${batch.batchId}/ack`,
          headers: bearer(receiverToken),
          payload: { status: 'applied', importedAt: deterministicFixture.now },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await built.app.inject({
          method: 'DELETE',
          url: `/v1/batches/${batch.batchId}`,
          headers: bearer(senderToken),
        })
      ).statusCode,
    ).toBe(204);
  });

  it('rejeita signer não pareado, destino cross-tenant e colisão idempotente', async () => {
    const batch = makeBatch(Buffer.from('ciphertext'));
    const headers = { ...bearer(senderToken), 'idempotency-key': 'batch-negative-idempotency-01' };
    expect(
      (
        await built.app.inject({
          method: 'POST',
          url: '/v1/batches',
          headers,
          payload: { ...batch, signerPublicKey: deterministicFixture.otherPublicKey },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await built.app.inject({
          method: 'POST',
          url: '/v1/batches',
          headers,
          payload: { ...batch, targetDeviceId: deterministicFixture.otherDeviceId },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await built.app.inject({ method: 'POST', url: '/v1/batches', headers, payload: batch }))
        .statusCode,
    ).toBe(201);
    expect(
      (
        await built.app.inject({
          method: 'POST',
          url: '/v1/batches',
          headers,
          payload: { ...batch, batchId: randomUUID() },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await built.app.inject({
          method: 'GET',
          url: `/v1/batches/${batch.batchId}`,
          headers: bearer(otherToken),
        })
      ).statusCode,
    ).toBe(404);
  });

  it('emite ticket realtime de uso único e rejeita replay', async () => {
    const issued = await built.app.inject({
      method: 'POST',
      url: '/v1/realtime/ticket',
      headers: bearer(senderToken),
    });
    expect(issued.statusCode).toBe(200);
    const { ticket } = issued.json<{ ticket: string }>();
    const socket = await built.app.injectWS(`/v1/realtime?ticket=${encodeURIComponent(ticket)}`);
    socket.terminate();
    await expect(
      built.app.injectWS(`/v1/realtime?ticket=${encodeURIComponent(ticket)}`),
    ).rejects.toThrow();
    await expect(built.app.injectWS('/v1/realtime?ticket=invalid-ticket-value')).rejects.toThrow();
  });

  it('valida upload e cobre sync legado idempotente, conflito e isolamento', async () => {
    const invalid = await built.app.inject({
      method: 'POST',
      url: '/v1/uploads/presign',
      headers: bearer(senderToken),
      payload: {
        fileName: '../record.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 100,
        purpose: 'document',
      },
    });
    expect(invalid.statusCode).toBe(400);
    const upload = await built.app.inject({
      method: 'POST',
      url: '/v1/uploads/presign',
      headers: bearer(senderToken),
      payload: {
        fileName: 'encrypted-backup.enc',
        mimeType: 'application/octet-stream',
        sizeBytes: 100,
        purpose: 'backup',
      },
    });
    expect(upload.statusCode).toBe(200);
    expect(upload.json().requiredHeaders['content-type']).toBe('application/octet-stream');
    expect(
      (await built.app.inject({ method: 'GET', url: '/v1/sync/pull?cursor=0' })).statusCode,
    ).toBe(401);

    const payload = Buffer.from('legacy-opaque-change');
    const entityId = randomUUID();
    const changeId = randomUUID();
    const change = {
      changeId,
      entityType: 'setting',
      entityId,
      operation: 'upsert',
      expectedRevision: 0,
      modifiedAt: deterministicFixture.now,
      encryption: {
        algorithm: 'aes-256-gcm',
        keyId: 'clinic-key:v1',
        nonce: 'YWJjZGVmZ2hpamts',
      },
      payloadCiphertext: payload.toString('base64'),
      payloadHash: createHash('sha256').update(payload).digest('hex'),
    } as const;
    const pushBody = {
      schemaVersion: 1,
      deviceId: deterministicFixture.senderDeviceId,
      changes: [change],
    };
    const push = await built.app.inject({
      method: 'POST',
      url: '/v1/sync/push',
      headers: bearer(senderToken),
      payload: pushBody,
    });
    expect(push.statusCode).toBe(200);
    expect(push.json().acceptedChangeIds).toEqual([changeId]);
    const duplicate = await built.app.inject({
      method: 'POST',
      url: '/v1/sync/push',
      headers: bearer(senderToken),
      payload: pushBody,
    });
    expect(duplicate.json().acceptedChangeIds).toEqual([changeId]);
    const conflict = await built.app.inject({
      method: 'POST',
      url: '/v1/sync/push',
      headers: bearer(senderToken),
      payload: {
        ...pushBody,
        changes: [{ ...change, changeId: randomUUID() }],
      },
    });
    expect(conflict.json().conflicts).toHaveLength(1);
    const pull = await built.app.inject({
      method: 'GET',
      url: '/v1/sync/pull?cursor=0',
      headers: bearer(receiverToken),
    });
    expect(pull.json().changes).toEqual([
      expect.objectContaining({ changeId, sourceDeviceId: deterministicFixture.senderDeviceId }),
    ]);
    const crossTenantPull = await built.app.inject({
      method: 'GET',
      url: '/v1/sync/pull?cursor=0',
      headers: bearer(otherToken),
    });
    expect(crossTenantPull.json().changes).toHaveLength(0);
  });
});

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

function makeBatch(payload: Buffer): CreateBatch {
  return {
    schemaVersion: 1,
    batchId: randomUUID(),
    originDeviceId: deterministicFixture.senderDeviceId,
    targetDeviceId: deterministicFixture.receiverDeviceId,
    createdAt: deterministicFixture.now,
    expiresAt: '2030-01-01T00:10:00.000Z',
    contentHash: createHash('sha256').update(payload).digest('hex'),
    signerPublicKey: deterministicFixture.senderPublicKey,
    signature: `${'A'.repeat(86)}==`,
    encryption: {
      algorithm: 'aes-256-gcm',
      keyId: 'clinic-key:v1',
      nonce: 'YWJjZGVmZ2hpamts',
    },
    payloadBase64: payload.toString('base64'),
  };
}
