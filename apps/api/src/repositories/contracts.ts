import type { AcknowledgeBatch, CreateBatch, SyncPush } from '@psicodesk/sync-protocol';
import type { DeviceIdentity, PullOutcome, PushOutcome, StoredBatch } from '../domain/types.js';

export interface HealthRepository {
  ping(): Promise<boolean>;
}

export interface AuthRepository {
  findDevice(clinicId: string, deviceId: string): Promise<DeviceIdentity | null>;
  touchDevice(clinicId: string, deviceId: string): Promise<void>;
}

export interface BatchRepository {
  create(
    clinicId: string,
    idempotencyKey: string,
    input: CreateBatch,
    payload: Uint8Array,
  ): Promise<{ batch: StoredBatch; created: boolean }>;
  findMetadata(clinicId: string, deviceId: string, batchId: string): Promise<StoredBatch | null>;
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
