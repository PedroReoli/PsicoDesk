import { decryptPayload, encryptPayload } from '../security/dataCipher';
import type { ProjectionEntity, TransferItem } from '../types/sync';
import { getDatabase } from './database';
import {
  materializeTransferItems,
  materializeTransferItemsAtomic,
  type ProjectionTransaction,
  type ProjectionWriter,
} from './projectionMaterializer';
export interface ProjectionRecord {
  entityType: ProjectionEntity;
  entityId: string;
  revision: number;
  payload: Record<string, unknown>;
  updatedAt: string;
}
interface Row {
  entity_type: ProjectionEntity;
  entity_id: string;
  revision: number;
  encrypted_payload: string;
  updated_at: string;
}
class SqliteProjectionWriter implements ProjectionWriter {
  async revision(entityType: ProjectionEntity, entityId: string) {
    const row = await (
      await getDatabase()
    ).getFirstAsync<{ revision: number }>(
      'SELECT revision FROM mobile_projection WHERE entity_type=? AND entity_id=?',
      entityType,
      entityId,
    );
    return row?.revision ?? null;
  }
  async upsert(item: TransferItem) {
    const encrypted = await encryptPayload(JSON.stringify(item.payload));
    await (
      await getDatabase()
    ).runAsync(
      'INSERT INTO mobile_projection(entity_type,entity_id,revision,encrypted_payload,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(entity_type,entity_id) DO UPDATE SET revision=excluded.revision,encrypted_payload=excluded.encrypted_payload,updated_at=excluded.updated_at',
      item.entityType,
      item.entityId,
      item.revision,
      encrypted,
      new Date().toISOString(),
    );
  }
  async remove(entityType: ProjectionEntity, entityId: string) {
    await (
      await getDatabase()
    ).runAsync(
      'DELETE FROM mobile_projection WHERE entity_type=? AND entity_id=?',
      entityType,
      entityId,
    );
  }
  async conflict(item: TransferItem, reason: string) {
    await (
      await getDatabase()
    ).runAsync(
      'INSERT INTO mobile_projection_conflicts(entity_type,entity_id,remote_revision,reason,created_at) VALUES (?,?,?,?,?)',
      item.entityType,
      item.entityId,
      item.revision,
      reason,
      new Date().toISOString(),
    );
  }
}
const writer = new SqliteProjectionWriter();
const transaction: ProjectionTransaction = {
  async transaction(work) {
    const database = await getDatabase();
    let completed = false;
    let result: unknown;
    await database.withTransactionAsync(async () => {
      result = await work(writer);
      completed = true;
    });
    if (!completed) throw new Error('Transação de projeção não concluída.');
    return result as Awaited<ReturnType<typeof work>>;
  },
};
export async function applyProjection(plaintext: unknown) {
  return materializeTransferItemsAtomic(transaction, plaintext);
}
export async function applyProjectionInCurrentTransaction(plaintext: unknown) {
  return materializeTransferItems(writer, plaintext);
}
export async function listProjection(entityType: ProjectionEntity): Promise<ProjectionRecord[]> {
  const rows = await (
    await getDatabase()
  ).getAllAsync<Row>(
    'SELECT entity_type,entity_id,revision,encrypted_payload,updated_at FROM mobile_projection WHERE entity_type=? ORDER BY updated_at DESC',
    entityType,
  );
  return Promise.all(
    rows.map(async (row) => ({
      entityType: row.entity_type,
      entityId: row.entity_id,
      revision: row.revision,
      payload: JSON.parse(await decryptPayload(row.encrypted_payload)) as Record<string, unknown>,
      updatedAt: row.updated_at,
    })),
  );
}
export async function projectionCounts() {
  const rows = await (
    await getDatabase()
  ).getAllAsync<{ entity_type: ProjectionEntity; total: number }>(
    'SELECT entity_type,COUNT(*) total FROM mobile_projection GROUP BY entity_type',
  );
  return Object.fromEntries(rows.map((row) => [row.entity_type, row.total])) as Partial<
    Record<ProjectionEntity, number>
  >;
}
