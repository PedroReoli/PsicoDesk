export function backoffDelay(attempt: number, random = Math.random()) {
  const bounded = Math.max(0, Math.min(attempt, 6));
  const base = Math.min(30_000, 500 * 2 ** bounded);
  return Math.round(base * (0.75 + random * 0.5));
}
export function isRetryableStatus(status: number) { return status === 408 || status === 429 || status >= 500; }
