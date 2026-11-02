import { describe, expect, it } from 'vitest';
import {
  batchListQuerySchema,
  createBatchSchema,
  deviceTokenInputSchema,
  realtimeEventSchema,
  registerDeviceInputSchema,
  syncPushSchema,
} from './schemas.js';
import { batchSigningPayload } from './signing.js';

const uuid = '0f927a23-df4a-4eb2-8c9d-b8cd03c54ccb';

describe('sync protocol', () => {
  it('rejects a batch that expires before it is created', () => {
    const result = createBatchSchema.safeParse({
      schemaVersion: 1,
      batchId: uuid,
      originDeviceId: uuid,
      targetDeviceId: 'ee4e9f12-0a1f-4e59-aac6-44277b5786e9',
      createdAt: '2026-11-02T12:00:00Z',
      expiresAt: '2026-11-01T12:00:00Z',
      contentHash: 'a'.repeat(64),
      signerPublicKey: `${'A'.repeat(43)}=`,
      signature: `${'A'.repeat(86)}==`,
      encryption: { algorithm: 'aes-256-gcm', keyId: 'clinic-key', nonce: 'YWJjZGVmZ2hpamts' },
      payloadBase64: 'dGVzdGU=',
    });
    expect(result.success).toBe(false);
  });

  it('limits sync pushes to 500 changes', () => {
    const change = {
      changeId: uuid,
      entityType: 'patient',
      entityId: uuid,
      operation: 'upsert',
      expectedRevision: 0,
      modifiedAt: '2026-11-02T12:00:00Z',
      encryption: { algorithm: 'aes-256-gcm', keyId: 'clinic-key', nonce: 'YWJjZGVmZ2hpamts' },
      payloadCiphertext: 'dGVzdGU=',
      payloadHash: 'a'.repeat(64),
    };
    expect(
      syncPushSchema.safeParse({
        schemaVersion: 1,
        deviceId: uuid,
        changes: Array.from({ length: 501 }, () => change),
      }).success,
    ).toBe(false);
  });

  it('does not accept PHI-shaped realtime events', () => {
    expect(
      realtimeEventSchema.safeParse({
        type: 'batch.available',
        batchId: uuid,
        patientName: 'Não permitido',
      }).success,
    ).toBe(true);
    expect(
      Object.keys(
        realtimeEventSchema.parse({
          type: 'batch.available',
          batchId: uuid,
          patientName: 'Não permitido',
        }),
      ),
    ).toEqual(['type', 'batchId']);
  });

  it('normaliza paginação de batches sem aceitar destinatário arbitrário', () => {
    const query = batchListQuerySchema.parse({ cursor: '10', limit: '25' });
    expect(query).toEqual({ cursor: '10', limit: 25 });
    expect('targetDeviceId' in query).toBe(false);
  });

  it('valida provisionamento e troca de credencial do dispositivo', () => {
    expect(
      registerDeviceInputSchema.safeParse({
        clinicId: uuid,
        enrollmentToken: 'e'.repeat(32),
        deviceName: 'Notebook recepção',
        signingPublicKey: `${'A'.repeat(43)}=`,
      }).success,
    ).toBe(true);
    expect(
      deviceTokenInputSchema.safeParse({
        clinicId: uuid,
        deviceId: uuid,
        deviceSecret: 'short',
      }).success,
    ).toBe(false);
  });

  it('gera bytes de assinatura determinísticos e sem campos mutáveis do servidor', () => {
    const batch = createBatchSchema.parse({
      schemaVersion: 1,
      batchId: uuid,
      originDeviceId: uuid,
      targetDeviceId: 'ee4e9f12-0a1f-4e59-aac6-44277b5786e9',
      createdAt: '2026-11-02T12:00:00Z',
      expiresAt: '2026-11-02T12:10:00Z',
      contentHash: 'A'.repeat(64),
      signerPublicKey: `${'A'.repeat(43)}=`,
      signature: `${'A'.repeat(86)}==`,
      encryption: { algorithm: 'aes-256-gcm', keyId: 'clinic-key:v1', nonce: 'YWJjZGVmZ2hpamts' },
      payloadBase64: 'dGVzdGU=',
    });
    expect(new TextDecoder().decode(batchSigningPayload(batch))).toBe(
      [
        'psicodesk-batch-v1',
        '1',
        uuid,
        uuid,
        'ee4e9f12-0a1f-4e59-aac6-44277b5786e9',
        '2026-11-02T12:00:00Z',
        '2026-11-02T12:10:00Z',
        'a'.repeat(64),
        'aes-256-gcm',
        'clinic-key:v1',
        'YWJjZGVmZ2hpamts',
        'dGVzdGU=',
      ].join('\n'),
    );
  });
});
