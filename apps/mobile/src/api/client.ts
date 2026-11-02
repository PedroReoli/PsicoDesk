import Constants from 'expo-constants';
import { backoffDelay, isRetryableStatus } from './backoff';
const configured = process.env.EXPO_PUBLIC_API_URL ?? Constants.expoConfig?.extra?.apiUrl;
export const API_URL = typeof configured === 'string' ? configured.replace(/\/$/, '') : '';
export class ApiError extends Error { constructor(message: string, readonly status: number, readonly code = 'API_ERROR') { super(message); this.name = 'ApiError'; } }
export interface RequestOptions extends Omit<RequestInit, 'body'> { token?: string; body?: unknown; timeoutMs?: number; retries?: number; idempotencyKey?: string; }
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!API_URL) throw new ApiError('Configure EXPO_PUBLIC_API_URL antes de sincronizar.', 0, 'API_NOT_CONFIGURED');
  const { token, body, timeoutMs = 10_000, retries = 2, idempotencyKey, headers, ...request } = options;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const requestHeaders = new Headers(headers);
      requestHeaders.set('Accept', 'application/json');
      requestHeaders.set('Content-Type', 'application/json');
      if (token) requestHeaders.set('Authorization', `Bearer ${token}`);
      if (idempotencyKey) requestHeaders.set('Idempotency-Key', idempotencyKey);
      const response = await fetch(`${API_URL}${path}`, { ...request, signal: controller.signal, headers: requestHeaders, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string; code?: string } | null;
        if (attempt < retries && isRetryableStatus(response.status)) { await new Promise((resolve) => setTimeout(resolve, backoffDelay(attempt))); continue; }
        throw new ApiError(payload?.message ?? 'A solicitação não pôde ser concluída.', response.status, payload?.code ?? 'API_ERROR');
      }
      if (response.status === 204) return undefined as T;
      return await response.json() as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (attempt >= retries) throw new ApiError(error instanceof Error && error.name === 'AbortError' ? 'A conexão excedeu o tempo limite.' : 'Sem conexão com o PsicoDesk.', 0, 'NETWORK_ERROR');
      await new Promise((resolve) => setTimeout(resolve, backoffDelay(attempt)));
    } finally { clearTimeout(timeout); }
  }
  throw new ApiError('A solicitação falhou.', 0);
}
