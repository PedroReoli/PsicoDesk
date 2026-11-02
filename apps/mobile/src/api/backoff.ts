export function backoffDelay(attempt: number, random = Math.random()) {
  const bounded = Math.max(0, Math.min(attempt, 6));
  const base = Math.min(30_000, 500 * 2 ** bounded);
  return Math.round(base * (0.75 + random * 0.5));
}
export function isRetryableStatus(status: number) {
  return (
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

export function canRetryRequest(method = 'GET', idempotencyKey?: string) {
  const normalized = method.toUpperCase();
  return (
    normalized === 'GET' ||
    normalized === 'HEAD' ||
    normalized === 'OPTIONS' ||
    Boolean(idempotencyKey)
  );
}

export function boundedRetryCount(retries: number, method?: string, idempotencyKey?: string) {
  if (!canRetryRequest(method, idempotencyKey) || !Number.isFinite(retries)) return 0;
  return Math.max(0, Math.min(4, Math.floor(retries)));
}

export function retryDelay(
  retryAfter: string | null,
  attempt: number,
  now = Date.now(),
  random = Math.random(),
) {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const parsed = Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(retryAfter) - now;
    if (Number.isFinite(parsed) && parsed >= 0) return Math.min(60_000, Math.round(parsed));
  }
  return backoffDelay(attempt, random);
}
