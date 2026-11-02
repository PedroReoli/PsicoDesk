import { describe, expect, it } from 'vitest';
import { createBatchSchema, realtimeEventSchema, syncPushSchema } from './schemas.js';

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
      signature: 's'.repeat(64),
      encryption: { algorithm: 'aes-256-gcm', keyId: 'clinic-key', nonce: 'n'.repeat(24) },
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
      payloadCiphertext: 'dGVzdGU=',
      payloadHash: 'a'.repeat(64),
    };
    expect(
      syncPushSchema.safeParse({
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
});
