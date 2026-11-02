import { apiRequest } from '../api/client';
import * as Crypto from 'expo-crypto';
import { getDatabase } from '../database/database';
import { decryptPayload, encryptPayload } from '../security/dataCipher';
import { mutationFailurePolicy } from './queuePolicy';
interface QueuedMutation {
  id: string;
  resource: string;
  method: string;
  path: string;
  payload: string | null;
  idempotency_key: string;
  attempts: number;
}
function uniqueId() {
  return Crypto.randomUUID();
}
export async function enqueueMutation(
  resource: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  payload?: unknown,
  idempotencyKey = uniqueId(),
) {
  const db = await getDatabase();
  const id = uniqueId();
  const encrypted = payload === undefined ? null : await encryptPayload(JSON.stringify(payload));
  await db.runAsync(
    'INSERT INTO mutation_queue(id, resource, method, path, payload, idempotency_key, next_attempt_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    resource,
    method,
    path,
    encrypted,
    idempotencyKey,
    new Date().toISOString(),
    new Date().toISOString(),
  );
  return id;
}
export async function queueCounts() {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ status: string; total: number }>(
    'SELECT status, COUNT(*) AS total FROM mutation_queue GROUP BY status',
  );
  return {
    pending: rows.find((row) => row.status === 'pending')?.total ?? 0,
    failed: rows.find((row) => row.status === 'failed')?.total ?? 0,
  };
}
export async function pendingCount() {
  return (await queueCounts()).pending;
}
export async function drainMutationQueue(token: string) {
  const db = await getDatabase();
  const rows = await db.getAllAsync<QueuedMutation>(
    "SELECT id, resource, method, path, payload, idempotency_key, attempts FROM mutation_queue WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY created_at LIMIT 25",
    new Date().toISOString(),
  );
  for (const item of rows) {
    try {
      const body = item.payload
        ? (JSON.parse(await decryptPayload(item.payload)) as unknown)
        : undefined;
      await apiRequest(item.path, {
        method: item.method,
        token,
        body,
        idempotencyKey: item.idempotency_key,
        retries: 0,
      });
      await db.runAsync('DELETE FROM mutation_queue WHERE id = ?', item.id);
    } catch (cause) {
      const attempts = item.attempts + 1;
      const policy = mutationFailurePolicy(cause, attempts);
      const next = new Date(Date.now() + policy.delayMs).toISOString();
      await db.runAsync(
        'UPDATE mutation_queue SET attempts = ?, next_attempt_at = ?, last_error = ?, status = ? WHERE id = ?',
        attempts,
        next,
        policy.code,
        policy.terminal ? 'failed' : 'pending',
        item.id,
      );
    }
  }
  return queueCounts();
}
