import { ApiError, apiRequest } from '../api/client';
import { enqueueMutation } from './mutationQueue';
export async function mutateOfflineFirst(token: string, resource: string, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, payload?: unknown) {
  try { return await apiRequest(path, { method, token, body: payload, retries: 0 }); }
  catch (cause) { if (cause instanceof ApiError && (cause.code === 'NETWORK_ERROR' || cause.code === 'API_NOT_CONFIGURED')) { await enqueueMutation(resource, method, path, payload); return { queued: true }; } throw cause; }
}
