import { getDatabase } from './database';
export async function clearProtectedCache() {
  const database = await getDatabase();
  await database.execAsync(
    'DELETE FROM cache_entries; DELETE FROM mutation_queue; DELETE FROM batch_outbox; DELETE FROM batch_inbox; DELETE FROM batch_state; DELETE FROM sync_state; DELETE FROM mobile_projection; DELETE FROM mobile_projection_conflicts;',
  );
}
