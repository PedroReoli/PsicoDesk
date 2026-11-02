import { getDatabase } from './database';
import { decryptPayload, encryptPayload } from '../security/dataCipher';
export async function replaceCache<T extends { id: string; updatedAt: string }>(resource: string, items: readonly T[]) {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    await database.runAsync('DELETE FROM cache_entries WHERE resource = ?', resource);
    for (const item of items) await database.runAsync('INSERT INTO cache_entries(resource, entity_id, payload, updated_at) VALUES (?, ?, ?, ?)', resource, item.id, await encryptPayload(JSON.stringify(item)), item.updatedAt);
  });
}
export async function readCache<T>(resource: string) {
  const database = await getDatabase();
  const rows = await database.getAllAsync<{ payload: string }>('SELECT payload FROM cache_entries WHERE resource = ? ORDER BY updated_at DESC', resource);
  const items: T[] = [];
  for (const row of rows) { try { items.push(JSON.parse(await decryptPayload(row.payload)) as T); } catch { /* Entrada corrompida é ignorada e será substituída na próxima sincronização. */ } }
  return items;
}
export async function clearProtectedCache() {
  const database = await getDatabase();
  await database.execAsync('DELETE FROM cache_entries; DELETE FROM mutation_queue; DELETE FROM sync_state;');
}
