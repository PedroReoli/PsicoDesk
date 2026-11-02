import type {
  AcknowledgeBatch,
  BatchListQuery,
  CreateBatch,
  DevicePeer,
  SyncChange,
  SyncPush,
} from '@psicodesk/sync-protocol';
import type { StorageAdapter } from '../adapters/storage/contract.js';
import { errors } from '../domain/errors.js';
import type {
  DeviceIdentity,
  PullOutcome,
  PushOutcome,
  Scope,
  StoredBatch,
} from '../domain/types.js';
import type {
  AuthRepository,
  BatchRepository,
  DeviceDirectoryRepository,
  DeviceRegistrationRepository,
  HealthRepository,
  SyncRepository,
} from '../repositories/contracts.js';

export class MemoryIdentityRepository
  implements AuthRepository, DeviceRegistrationRepository, DeviceDirectoryRepository
{
  readonly devices = new Map<string, DeviceIdentity>();
  readonly enrollments = new Map<string, readonly Scope[]>();

  seedDevice(device: DeviceIdentity): void {
    this.devices.set(key(device.clinicId, device.deviceId), device);
  }

  seedEnrollment(clinicId: string, enrollmentTokenHash: string, scopes: readonly Scope[]): void {
    this.enrollments.set(key(clinicId, enrollmentTokenHash), scopes);
  }

  async findDevice(clinicId: string, deviceId: string) {
    return this.devices.get(key(clinicId, deviceId)) ?? null;
  }

  async touchDevice() {}

  async consumeEnrollmentAndCreateDevice(input: {
    clinicId: string;
    enrollmentTokenHash: string;
    deviceId: string;
    deviceName: string;
    deviceSecretHash: string;
    signingPublicKey: string;
    signingKeyFingerprint: string;
    createdAt: string;
  }) {
    const enrollmentKey = key(input.clinicId, input.enrollmentTokenHash);
    const scopes = this.enrollments.get(enrollmentKey);
    if (!scopes) return null;
    this.enrollments.delete(enrollmentKey);
    this.seedDevice({
      clinicId: input.clinicId,
      deviceId: input.deviceId,
      name: input.deviceName,
      secretHash: input.deviceSecretHash,
      status: 'active',
      scopes,
      signingPublicKey: input.signingPublicKey,
      signingKeyFingerprint: input.signingKeyFingerprint,
    });
    return { scopes };
  }

  async listPeers(clinicId: string, deviceId: string): Promise<DevicePeer[]> {
    return [...this.devices.values()]
      .filter(
        (device) =>
          device.clinicId === clinicId &&
          device.deviceId !== deviceId &&
          device.status === 'active' &&
          device.signingPublicKey &&
          device.signingKeyFingerprint,
      )
      .map((device) => ({
        deviceId: device.deviceId,
        name: device.name,
        signingPublicKey: device.signingPublicKey!,
        signingKeyFingerprint: device.signingKeyFingerprint!,
      }))
      .sort((left, right) => left.deviceId.localeCompare(right.deviceId));
  }
}

export class MemoryBatchRepository implements BatchRepository {
  readonly batches = new Map<string, StoredBatch>();
  readonly activeTargets = new Set<string>();
  private readonly idempotency = new Map<string, { batchId: string; hash: string }>();
  private readonly acknowledgements = new Map<string, AcknowledgeBatch>();
  private cursor = 0;

  seedTarget(clinicId: string, deviceId: string): void {
    this.activeTargets.add(key(clinicId, deviceId));
  }

  async isActiveTarget(clinicId: string, deviceId: string): Promise<boolean> {
    return this.activeTargets.has(key(clinicId, deviceId));
  }

  async create(clinicId: string, idempotencyKey: string, input: CreateBatch, payload: Uint8Array) {
    const idempotencyKeyScoped = key(clinicId, idempotencyKey);
    const existing = this.idempotency.get(idempotencyKeyScoped);
    if (existing) {
      if (existing.batchId !== input.batchId || existing.hash !== input.contentHash)
        throw errors.conflict('A chave de idempotência já foi usada para outra carga.');
      return { batch: this.batches.get(key(clinicId, existing.batchId))!, created: false };
    }
    this.cursor += 1;
    const batch: StoredBatch = {
      ...input,
      clinicId,
      deliveryCursor: String(this.cursor),
      receivedAt: input.createdAt,
      acknowledgedAt: null,
      status: 'pending',
      payload,
      idempotencyKey,
    };
    this.batches.set(key(clinicId, input.batchId), batch);
    this.idempotency.set(idempotencyKeyScoped, {
      batchId: input.batchId,
      hash: input.contentHash,
    });
    return { batch, created: true };
  }

  async findMetadata(clinicId: string, deviceId: string, batchId: string) {
    const batch = this.batches.get(key(clinicId, batchId));
    return batch &&
      batch.status !== 'deleted' &&
      (batch.originDeviceId === deviceId || batch.targetDeviceId === deviceId)
      ? batch
      : null;
  }

  async listForTarget(clinicId: string, deviceId: string, query: BatchListQuery) {
    const candidates = [...this.batches.values()]
      .filter(
        (batch) =>
          batch.clinicId === clinicId &&
          batch.targetDeviceId === deviceId &&
          BigInt(batch.deliveryCursor) > BigInt(query.cursor) &&
          (query.status
            ? batch.status === query.status
            : ['pending', 'downloaded'].includes(batch.status)),
      )
      .sort((left, right) => Number(BigInt(left.deliveryCursor) - BigInt(right.deliveryCursor)));
    const selected = candidates.slice(0, query.limit);
    return {
      items: selected.map(toBatchMetadata),
      nextCursor: selected.at(-1)?.deliveryCursor ?? query.cursor,
      hasMore: candidates.length > query.limit,
    };
  }

  async findPayload(clinicId: string, deviceId: string, batchId: string) {
    const batch = this.batches.get(key(clinicId, batchId));
    if (
      !batch ||
      batch.targetDeviceId !== deviceId ||
      !['pending', 'downloaded'].includes(batch.status)
    )
      return null;
    batch.status = 'downloaded';
    return batch;
  }

  async acknowledge(clinicId: string, deviceId: string, batchId: string, input: AcknowledgeBatch) {
    const batch = this.batches.get(key(clinicId, batchId));
    if (!batch || batch.targetDeviceId !== deviceId) return null;
    const acknowledgementKey = key(clinicId, batchId);
    if (!['pending', 'downloaded'].includes(batch.status)) {
      const existing = this.acknowledgements.get(acknowledgementKey);
      if (
        existing?.status === input.status &&
        existing.importedAt === input.importedAt &&
        existing.resultHash === input.resultHash
      )
        return batch;
      throw errors.conflict('O lote já recebeu uma confirmação terminal divergente.');
    }
    batch.status = input.status;
    batch.acknowledgedAt = input.importedAt;
    this.acknowledgements.set(acknowledgementKey, { ...input });
    return batch;
  }

  async softDelete(clinicId: string, deviceId: string, batchId: string) {
    const batch = this.batches.get(key(clinicId, batchId));
    if (!batch || batch.originDeviceId !== deviceId || batch.status === 'deleted') return false;
    batch.status = 'deleted';
    batch.payload = new Uint8Array();
    return true;
  }
}

export class MemorySyncRepository implements SyncRepository {
  private readonly changes: Array<SyncChange & { clinicId: string }> = [];
  private readonly revisions = new Map<string, number>();
  private readonly accepted = new Map<string, SyncChange>();
  private cursor = 0;

  async push(clinicId: string, deviceId: string, input: SyncPush): Promise<PushOutcome> {
    const acceptedChangeIds: string[] = [];
    const conflicts: PushOutcome['conflicts'] = [];
    for (const change of input.changes) {
      const acceptedKey = key(clinicId, change.changeId);
      if (this.accepted.has(acceptedKey)) {
        acceptedChangeIds.push(change.changeId);
        continue;
      }
      const entityKey = `${clinicId}:${change.entityType}:${change.entityId}`;
      const currentRevision = this.revisions.get(entityKey) ?? 0;
      if (currentRevision !== change.expectedRevision) {
        conflicts.push({
          conflictId: change.changeId,
          entityType: change.entityType,
          entityId: change.entityId,
          incomingChangeId: change.changeId,
          expectedRevision: change.expectedRevision,
          currentRevision,
          createdAt: change.modifiedAt,
        });
        continue;
      }
      this.cursor += 1;
      const stored: SyncChange = {
        ...change,
        cursor: String(this.cursor),
        revision: currentRevision + 1,
        sourceDeviceId: deviceId,
      };
      this.revisions.set(entityKey, stored.revision);
      this.accepted.set(acceptedKey, stored);
      this.changes.push({ ...stored, clinicId });
      acceptedChangeIds.push(change.changeId);
    }
    return { acceptedChangeIds, conflicts, cursor: String(this.cursor) };
  }

  async pull(
    clinicId: string,
    deviceId: string,
    cursor: string,
    limit: number,
  ): Promise<PullOutcome> {
    const candidates = this.changes.filter(
      (change) =>
        change.clinicId === clinicId &&
        change.sourceDeviceId !== deviceId &&
        BigInt(change.cursor) > BigInt(cursor),
    );
    const selected = candidates.slice(0, limit).map(({ clinicId: _clinicId, ...change }) => change);
    return {
      changes: selected,
      nextCursor: selected.at(-1)?.cursor ?? cursor,
      hasMore: candidates.length > limit,
    };
  }
}

export class DeterministicStorage implements StorageAdapter {
  async createUploadUrl(input: {
    key: string;
    mimeType: string;
    sizeBytes: number;
    expiresInSeconds: number;
  }) {
    return {
      key: input.key,
      url: 'https://storage.invalid/upload',
      expiresAt: '2030-01-01T00:05:00.000Z',
      requiredHeaders: {
        'content-type': input.mimeType,
        'content-length': String(input.sizeBytes),
      },
    };
  }
  async createDownloadUrl() {
    return { url: 'https://storage.invalid/download', expiresAt: '2030-01-01T00:05:00.000Z' };
  }
}

export class ToggleHealthRepository implements HealthRepository {
  available = true;
  async ping() {
    if (!this.available) throw new Error('database unavailable');
    return true;
  }
}

function key(left: string, right: string): string {
  return `${left}:${right}`;
}

function toBatchMetadata(batch: StoredBatch) {
  const { payload: _payload, idempotencyKey: _idempotencyKey, ...metadata } = batch;
  return metadata;
}
