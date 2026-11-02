import { utf8ToBytes } from '@noble/ciphers/utils.js';
import type { BatchEnvelope } from '../types/sync';

export function batchSigningBytes(envelope: Omit<BatchEnvelope, 'signature'>): Uint8Array {
  return utf8ToBytes(
    `psicodesk-batch-v1\n${envelope.schemaVersion}\n${envelope.batchId}\n${envelope.originDeviceId}\n${envelope.targetDeviceId}\n${envelope.createdAt}\n${envelope.expiresAt}\n${envelope.contentHash.toLowerCase()}\n${envelope.encryption.algorithm}\n${envelope.encryption.keyId}\n${envelope.encryption.nonce}\n${envelope.payloadBase64}`,
  );
}
