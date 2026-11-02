export type MobileRole = 'owner' | 'admin' | 'psychologist' | 'receptionist' | 'finance';
export type ProjectionEntity =
  'patient' | 'appointment' | 'clinicalRecord' | 'charge' | 'payment' | 'document';
export interface TransferItem {
  entityType: ProjectionEntity;
  entityId: string;
  revision: number;
  operation: 'upsert' | 'delete';
  payload: Record<string, unknown>;
}
export interface DeviceCredentials {
  serverUrl: string;
  clinicId: string;
  deviceId: string;
  deviceSecret: string;
  deviceName: string;
  role: MobileRole;
  syncKeyHex: string;
  syncKeyId: string;
  signingPrivateKeyHex: string;
  signingPublicKey: string;
  peerDeviceId: string;
  trustedPeerPublicKey: string;
  trustedPeerFingerprint: string;
}
export interface DeviceIdentity {
  serverUrl: string;
  clinicId: string;
  deviceId: string;
  deviceName: string;
  role: MobileRole;
}
export interface DeviceSession extends DeviceIdentity {
  accessToken: string | null;
  expiresAt: string | null;
}
export interface EncryptionMetadata {
  algorithm: 'aes-256-gcm';
  keyId: string;
  nonce: string;
}
export interface BatchEnvelope {
  schemaVersion: 1;
  batchId: string;
  originDeviceId: string;
  targetDeviceId: string;
  createdAt: string;
  expiresAt: string;
  contentHash: string;
  signerPublicKey: string;
  signature: string;
  encryption: EncryptionMetadata;
  payloadBase64: string;
}
export interface BatchMetadata extends Omit<BatchEnvelope, 'payloadBase64'> {
  clinicId: string;
  deliveryCursor: string;
  status: 'pending' | 'downloaded';
  receivedAt: string;
  acknowledgedAt: string | null;
}
export interface BatchListResult {
  items: BatchMetadata[];
  nextCursor: string;
  hasMore: boolean;
}
export interface SyncCounts {
  pending: number;
  failed: number;
  conflicts: number;
  received: number;
}
