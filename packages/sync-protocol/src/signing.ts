import type { CreateBatch } from './schemas.js';

export function batchSigningPayload(batch: CreateBatch): Uint8Array {
  return new TextEncoder().encode(
    [
      'psicodesk-batch-v1',
      String(batch.schemaVersion),
      batch.batchId,
      batch.originDeviceId,
      batch.targetDeviceId,
      batch.createdAt,
      batch.expiresAt,
      batch.contentHash.toLowerCase(),
      batch.encryption.algorithm,
      batch.encryption.keyId,
      batch.encryption.nonce,
      batch.payloadBase64,
    ].join('\n'),
  );
}
