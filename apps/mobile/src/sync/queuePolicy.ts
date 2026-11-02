import { backoffDelay, isRetryableStatus } from '../api/backoff.ts';

export const MAX_MUTATION_ATTEMPTS = 8;
interface FailureLike {
  status?: number;
  code?: string;
}
export function mutationFailurePolicy(cause: unknown, attempts: number, random = Math.random()) {
  const failure = typeof cause === 'object' && cause !== null ? (cause as FailureLike) : {};
  const status = typeof failure.status === 'number' ? failure.status : 0;
  const terminal =
    attempts >= MAX_MUTATION_ATTEMPTS ||
    (status >= 400 && status < 500 && !isRetryableStatus(status));
  const code = terminal
    ? 'MUTATION_REJECTED'
    : failure.code === 'NETWORK_ERROR'
      ? 'NETWORK_ERROR'
      : 'SYNC_TEMPORARY_ERROR';
  return { terminal, code, delayMs: terminal ? 0 : backoffDelay(attempts, random) };
}
