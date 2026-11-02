import { ApiError, apiRequest } from '../api/client';
import { isRetryableStatus } from '../api/backoff';
import * as Crypto from 'expo-crypto';
import { enqueueMutation } from './mutationQueue';
export async function mutateOfflineFirst(
  token: string,
  resource: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  payload?: unknown,
) {
  const idempotencyKey = Crypto.randomUUID();
  try {
    return await apiRequest(path, { method, token, body: payload, idempotencyKey, retries: 0 });
  } catch (cause) {
    if (
      cause instanceof ApiError &&
      (cause.code === 'NETWORK_ERROR' ||
        cause.code === 'API_NOT_CONFIGURED' ||
        isRetryableStatus(cause.status))
    ) {
      await enqueueMutation(resource, method, path, payload, idempotencyKey);
      return { queued: true };
    }
    throw cause;
  }
}
