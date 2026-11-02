import type {
  AcknowledgeBatch,
  BatchListResult,
  BatchMetadata,
  CreateBatch,
  SyncChange,
  SyncConflict,
  SyncPush,
} from '@psicodesk/sync-protocol';

export type Scope =
  | 'batches:read'
  | 'batches:write'
  | 'sync:read'
  | 'sync:write'
  | 'uploads:write'
  | 'realtime:connect'
  | 'devices:read';

export interface Principal {
  clinicId: string;
  deviceId: string;
  scopes: readonly Scope[];
  signingPublicKey: string | null;
}

export interface DeviceIdentity {
  clinicId: string;
  deviceId: string;
  secretHash: string;
  status: 'active' | 'revoked';
  scopes: readonly Scope[];
  name: string;
  signingPublicKey: string | null;
  signingKeyFingerprint: string | null;
}

export interface DeviceEnrollment {
  clinicId: string;
  enrollmentTokenHash: string;
  scopes: readonly Scope[];
  expiresAt: string;
}

export interface StoredBatch extends BatchMetadata {
  payload: Uint8Array;
  idempotencyKey: string;
}

export interface PushOutcome {
  acceptedChangeIds: string[];
  conflicts: SyncConflict[];
  cursor: string;
}

export interface PullOutcome {
  changes: SyncChange[];
  nextCursor: string;
  hasMore: boolean;
}

export type BatchListOutcome = BatchListResult;

export interface CreateBatchCommand {
  principal: Principal;
  idempotencyKey: string;
  input: CreateBatch;
}

export interface AcknowledgeBatchCommand {
  principal: Principal;
  batchId: string;
  input: AcknowledgeBatch;
}

export interface PushSyncCommand {
  principal: Principal;
  input: SyncPush;
}
