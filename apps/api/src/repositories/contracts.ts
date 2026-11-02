import type {
  AcknowledgeBatch,
  BatchListQuery,
  CreateBatch,
  RegisterDeviceInput,
  DevicePeer,
  SyncPush,
} from '@psicodesk/sync-protocol';
import type {
  BatchListOutcome,
  DeviceIdentity,
  PullOutcome,
  PushOutcome,
  Scope,
  StoredBatch,
} from '../domain/types.js';

export interface HealthRepository {
  ping(): Promise<boolean>;
}

export interface AuthRepository {
  findDevice(clinicId: string, deviceId: string): Promise<DeviceIdentity | null>;
  touchDevice(clinicId: string, deviceId: string): Promise<void>;
}

export interface DeviceRegistrationRepository {
  consumeEnrollmentAndCreateDevice(input: {
    clinicId: string;
    enrollmentTokenHash: string;
    deviceId: string;
    deviceName: RegisterDeviceInput['deviceName'];
    deviceSecretHash: string;
    signingPublicKey: string;
    signingKeyFingerprint: string;
    createdAt: string;
  }): Promise<{ scopes: readonly Scope[] } | null>;
}

export interface DeviceDirectoryRepository {
  listPeers(clinicId: string, deviceId: string): Promise<DevicePeer[]>;
}

export interface BatchRepository {
  isActiveTarget(clinicId: string, deviceId: string): Promise<boolean>;
  create(
    clinicId: string,
    idempotencyKey: string,
    input: CreateBatch,
    payload: Uint8Array,
  ): Promise<{ batch: StoredBatch; created: boolean }>;
  findMetadata(clinicId: string, deviceId: string, batchId: string): Promise<StoredBatch | null>;
  listForTarget(
    clinicId: string,
    deviceId: string,
    query: BatchListQuery,
  ): Promise<BatchListOutcome>;
  findPayload(clinicId: string, deviceId: string, batchId: string): Promise<StoredBatch | null>;
  acknowledge(
    clinicId: string,
    deviceId: string,
    batchId: string,
    input: AcknowledgeBatch,
  ): Promise<StoredBatch | null>;
  softDelete(clinicId: string, deviceId: string, batchId: string): Promise<boolean>;
}

export interface SyncRepository {
  push(clinicId: string, deviceId: string, input: SyncPush): Promise<PushOutcome>;
  pull(clinicId: string, deviceId: string, cursor: string, limit: number): Promise<PullOutcome>;
}
