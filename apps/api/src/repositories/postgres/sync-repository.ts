import type { SyncChange, SyncConflict, SyncPush } from '@psicodesk/sync-protocol';
import type { PullOutcome, PushOutcome } from '../../domain/types.js';
import type { SyncRepository } from '../contracts.js';
import type { PostgresDatabase } from './database.js';

export class PostgresSyncRepository implements SyncRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async push(clinicId: string, deviceId: string, input: SyncPush): Promise<PushOutcome> {
    return this.database.transaction(async (client) => {
      const acceptedChangeIds: string[] = [];
      const conflicts: SyncConflict[] = [];
      let cursor = '0';
      for (const change of input.changes) {
        const duplicate = await client.query<{ cursor: string }>(
          'SELECT cursor::text FROM sync_changes WHERE clinic_id=$1 AND change_id=$2',
          [clinicId, change.changeId],
        );
        if (duplicate.rows[0]) {
          acceptedChangeIds.push(change.changeId);
          cursor = maxCursor(cursor, duplicate.rows[0].cursor);
          continue;
        }
        const head = await client.query<{ revision: number }>(
          'SELECT revision FROM sync_entity_heads WHERE clinic_id=$1 AND entity_type=$2 AND entity_id=$3 FOR UPDATE',
          [clinicId, change.entityType, change.entityId],
        );
        const currentRevision = head.rows[0]?.revision ?? 0;
        if (currentRevision !== change.expectedRevision) {
          const conflict = await client.query<{ id: string; created_at: Date }>(
            `INSERT INTO sync_conflicts(clinic_id,entity_type,entity_id,incoming_change_id,expected_revision,current_revision)
             VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (clinic_id,incoming_change_id) DO UPDATE SET current_revision=excluded.current_revision RETURNING id,created_at`,
            [
              clinicId,
              change.entityType,
              change.entityId,
              change.changeId,
              change.expectedRevision,
              currentRevision,
            ],
          );
          conflicts.push({
            conflictId: conflict.rows[0]!.id,
            entityType: change.entityType,
            entityId: change.entityId,
            incomingChangeId: change.changeId,
            expectedRevision: change.expectedRevision,
            currentRevision,
            createdAt: conflict.rows[0]!.created_at.toISOString(),
          });
          continue;
        }
        const revision = currentRevision + 1;
        const inserted = await client.query<{ cursor: string }>(
          `INSERT INTO sync_changes(clinic_id,change_id,source_device_id,entity_type,entity_id,operation,revision,modified_at,payload_ciphertext,payload_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING cursor::text`,
          [
            clinicId,
            change.changeId,
            deviceId,
            change.entityType,
            change.entityId,
            change.operation,
            revision,
            change.modifiedAt,
            Buffer.from(change.payloadCiphertext, 'base64'),
            change.payloadHash,
          ],
        );
        await client.query(
          `INSERT INTO sync_entity_heads(clinic_id,entity_type,entity_id,revision,latest_change_id,updated_at)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (clinic_id,entity_type,entity_id)
           DO UPDATE SET revision=excluded.revision,latest_change_id=excluded.latest_change_id,updated_at=excluded.updated_at`,
          [
            clinicId,
            change.entityType,
            change.entityId,
            revision,
            change.changeId,
            change.modifiedAt,
          ],
        );
        acceptedChangeIds.push(change.changeId);
        cursor = maxCursor(cursor, inserted.rows[0]!.cursor);
      }
      return { acceptedChangeIds, conflicts, cursor };
    });
  }

  async pull(
    clinicId: string,
    deviceId: string,
    cursor: string,
    limit: number,
  ): Promise<PullOutcome> {
    const result = await this.database.query<{
      cursor: string;
      change_id: string;
      source_device_id: string;
      entity_type: SyncChange['entityType'];
      entity_id: string;
      operation: SyncChange['operation'];
      revision: number;
      modified_at: Date;
      payload_ciphertext: Buffer;
      payload_hash: string;
    }>(
      `SELECT cursor::text,change_id,source_device_id,entity_type,entity_id,operation,revision,modified_at,payload_ciphertext,payload_hash
       FROM sync_changes WHERE clinic_id=$1 AND cursor>$2::bigint AND source_device_id<>$3 ORDER BY cursor LIMIT $4`,
      [clinicId, cursor, deviceId, limit + 1],
    );
    const hasMore = result.rows.length > limit;
    const selected = result.rows.slice(0, limit);
    const changes: SyncChange[] = selected.map((row) => ({
      cursor: row.cursor,
      changeId: row.change_id,
      sourceDeviceId: row.source_device_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      operation: row.operation,
      revision: row.revision,
      modifiedAt: row.modified_at.toISOString(),
      payloadCiphertext: row.payload_ciphertext.toString('base64'),
      payloadHash: row.payload_hash,
    }));
    return { changes, nextCursor: selected.at(-1)?.cursor ?? cursor, hasMore };
  }
}

function maxCursor(left: string, right: string): string {
  return BigInt(left) >= BigInt(right) ? left : right;
}
