import type { AcknowledgeBatch, CreateBatch } from '@psicodesk/sync-protocol';
import { errors } from '../../domain/errors.js';
import type { StoredBatch } from '../../domain/types.js';
import type { BatchRepository } from '../contracts.js';
import type { DatabaseClient } from './database.js';

interface BatchRow {
  clinic_id: string;
  batch_id: string;
  idempotency_key: string;
  schema_version: number;
  origin_device_id: string;
  target_device_id: string;
  created_at: Date;
  expires_at: Date;
  received_at: Date;
  acknowledged_at: Date | null;
  content_hash: string;
  signature: string;
  encryption: StoredBatch['encryption'];
  payload: Buffer;
  status: StoredBatch['status'];
}

export class PostgresBatchRepository implements BatchRepository {
  constructor(private readonly database: DatabaseClient) {}

  async create(
    clinicId: string,
    idempotencyKey: string,
    input: CreateBatch,
    payload: Uint8Array,
  ): Promise<{ batch: StoredBatch; created: boolean }> {
    const inserted = await this.database.query<BatchRow>(
      `INSERT INTO batches(clinic_id,batch_id,idempotency_key,schema_version,origin_device_id,target_device_id,created_at,expires_at,content_hash,signature,encryption,payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
       ON CONFLICT (clinic_id,idempotency_key) DO NOTHING RETURNING *`,
      [
        clinicId,
        input.batchId,
        idempotencyKey,
        input.schemaVersion,
        input.originDeviceId,
        input.targetDeviceId,
        input.createdAt,
        input.expiresAt,
        input.contentHash,
        input.signature,
        JSON.stringify(input.encryption),
        Buffer.from(payload),
      ],
    );
    if (inserted.rows[0]) return { batch: mapBatch(inserted.rows[0]), created: true };
    const existing = await this.database.query<BatchRow>(
      'SELECT * FROM batches WHERE clinic_id=$1 AND idempotency_key=$2',
      [clinicId, idempotencyKey],
    );
    const row = existing.rows[0];
    if (!row) throw errors.conflict('A chave de idempotência não pôde ser reconciliada.');
    if (row.content_hash !== input.contentHash || row.batch_id !== input.batchId)
      throw errors.conflict('A chave de idempotência já foi usada para outra carga.');
    return { batch: mapBatch(row), created: false };
  }

  async findMetadata(
    clinicId: string,
    deviceId: string,
    batchId: string,
  ): Promise<StoredBatch | null> {
    const result = await this.database.query<BatchRow>(
      "SELECT * FROM batches WHERE clinic_id=$1 AND batch_id=$2 AND (origin_device_id=$3 OR target_device_id=$3) AND status <> 'deleted'",
      [clinicId, batchId, deviceId],
    );
    return result.rows[0] ? mapBatch(result.rows[0]) : null;
  }

  async findPayload(
    clinicId: string,
    deviceId: string,
    batchId: string,
  ): Promise<StoredBatch | null> {
    const result = await this.database.query<BatchRow>(
      `UPDATE batches SET status=CASE WHEN status='pending' THEN 'downloaded' ELSE status END
       WHERE clinic_id=$1 AND batch_id=$2 AND target_device_id=$3 AND status IN ('pending','downloaded') AND expires_at>now() RETURNING *`,
      [clinicId, batchId, deviceId],
    );
    return result.rows[0] ? mapBatch(result.rows[0]) : null;
  }

  async acknowledge(
    clinicId: string,
    deviceId: string,
    batchId: string,
    input: AcknowledgeBatch,
  ): Promise<StoredBatch | null> {
    const result = await this.database.query<BatchRow>(
      `UPDATE batches SET status=$4, acknowledged_at=$5, result_hash=$6
       WHERE clinic_id=$1 AND batch_id=$2 AND target_device_id=$3 AND status IN ('pending','downloaded') RETURNING *`,
      [clinicId, batchId, deviceId, input.status, input.importedAt, input.resultHash ?? null],
    );
    return result.rows[0] ? mapBatch(result.rows[0]) : null;
  }

  async softDelete(clinicId: string, deviceId: string, batchId: string): Promise<boolean> {
    const result = await this.database.query(
      "UPDATE batches SET status='deleted', payload='\\x'::bytea WHERE clinic_id=$1 AND batch_id=$2 AND origin_device_id=$3 AND status <> 'deleted'",
      [clinicId, batchId, deviceId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

function mapBatch(row: BatchRow): StoredBatch {
  return {
    clinicId: row.clinic_id,
    batchId: row.batch_id,
    idempotencyKey: row.idempotency_key,
    schemaVersion: row.schema_version,
    originDeviceId: row.origin_device_id,
    targetDeviceId: row.target_device_id,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    receivedAt: row.received_at.toISOString(),
    acknowledgedAt: row.acknowledged_at?.toISOString() ?? null,
    contentHash: row.content_hash,
    signature: row.signature,
    encryption: row.encryption,
    payload: row.payload,
    status: row.status,
  };
}
