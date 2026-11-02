import Constants from 'expo-constants';
import { boundedRetryCount, isRetryableStatus, retryDelay } from './backoff';
import { isSafeApiPath, normalizeApiUrl } from './config';
const configured = process.env.EXPO_PUBLIC_API_URL ?? Constants.expoConfig?.extra?.apiUrl;
export const API_URL = normalizeApiUrl(configured, __DEV__);
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = 'API_ERROR',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
export interface RequestOptions extends Omit<RequestInit, 'body'> {
  token?: string;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
  idempotencyKey?: string;
}
function safeError(status: number) {
  if (status === 401)
    return new ApiError('Sua sessão expirou. Entre novamente.', status, 'AUTH_REQUIRED');
  if (status === 403)
    return new ApiError(
      'Seu perfil não possui permissão para esta operação.',
      status,
      'ACCESS_DENIED',
    );
  if (status === 429)
    return new ApiError('Muitas tentativas. Aguarde e tente novamente.', status, 'RATE_LIMITED');
  if (status >= 500)
    return new ApiError('O PsicoDesk está temporariamente indisponível.', status, 'SERVER_ERROR');
  return new ApiError('A solicitação não pôde ser concluída.', status, 'REQUEST_REJECTED');
}
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!API_URL)
    throw new ApiError(
      'Configure EXPO_PUBLIC_API_URL antes de sincronizar.',
      0,
      'API_NOT_CONFIGURED',
    );
  if (!isSafeApiPath(path)) throw new ApiError('Caminho de API inválido.', 0, 'INVALID_REQUEST');
  const {
    token,
    body,
    timeoutMs = 10_000,
    retries = 2,
    idempotencyKey,
    headers,
    ...request
  } = options;
  const method = request.method ?? 'GET';
  const retryCount = boundedRetryCount(retries, method, idempotencyKey);
  const requestTimeout = Number.isFinite(timeoutMs)
    ? Math.max(1_000, Math.min(30_000, timeoutMs))
    : 10_000;
  for (let attempt = 0; attempt <= retryCount; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeout);
    try {
      const requestHeaders = new Headers(headers);
      requestHeaders.set('Accept', 'application/json');
      if (body !== undefined) requestHeaders.set('Content-Type', 'application/json');
      if (token) requestHeaders.set('Authorization', `Bearer ${token}`);
      if (idempotencyKey) requestHeaders.set('Idempotency-Key', idempotencyKey);
      const response = await fetch(`${API_URL}${path}`, {
        ...request,
        signal: controller.signal,
        headers: requestHeaders,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        if (attempt < retryCount && isRetryableStatus(response.status)) {
          await new Promise((resolve) =>
            setTimeout(resolve, retryDelay(response.headers.get('Retry-After'), attempt)),
          );
          continue;
        }
        throw safeError(response.status);
      }
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (attempt >= retryCount)
        throw new ApiError(
          error instanceof Error && error.name === 'AbortError'
            ? 'A conexão excedeu o tempo limite.'
            : 'Sem conexão com o PsicoDesk.',
          0,
          'NETWORK_ERROR',
        );
      await new Promise((resolve) => setTimeout(resolve, retryDelay(null, attempt)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new ApiError('A solicitação falhou.', 0);
}
