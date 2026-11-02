import { boundedRetryCount, isRetryableStatus, retryDelay } from './backoff.ts';
import { isSafeApiPath, normalizeApiUrl } from './config.ts';
const configured = process.env.EXPO_PUBLIC_API_URL;
const development = typeof __DEV__ !== 'undefined' && __DEV__;
export const API_URL = normalizeApiUrl(configured, development);
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
  baseUrl?: string;
  token?: string;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
  idempotencyKey?: string;
}
export interface ApiDependencies {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  sleep: (milliseconds: number) => Promise<void>;
  allowInsecureDevelopment?: boolean;
}
const defaultDependencies: ApiDependencies = {
  fetch: (url, init) => fetch(url, init),
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};
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
  if (status === 409) return new ApiError('A operação entrou em conflito.', status, 'CONFLICT');
  return new ApiError('A solicitação não pôde ser concluída.', status, 'REQUEST_REJECTED');
}
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
  dependencies: ApiDependencies = defaultDependencies,
): Promise<T> {
  const {
    baseUrl = API_URL,
    token,
    body,
    timeoutMs = 10_000,
    retries = 2,
    idempotencyKey,
    headers,
    ...request
  } = options;
  const normalizedBaseUrl = normalizeApiUrl(baseUrl, development || dependencies.allowInsecureDevelopment === true);
  if (!normalizedBaseUrl)
    throw new ApiError(
      'Configure EXPO_PUBLIC_API_URL antes de sincronizar.',
      0,
      'API_NOT_CONFIGURED',
    );
  if (!isSafeApiPath(path)) throw new ApiError('Caminho de API inválido.', 0, 'INVALID_REQUEST');
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
      const response = await dependencies.fetch(`${normalizedBaseUrl}${path}`, {
        ...request,
        signal: controller.signal,
        headers: requestHeaders,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) {
        if (attempt < retryCount && isRetryableStatus(response.status)) {
          await dependencies.sleep(retryDelay(response.headers.get('Retry-After'), attempt));
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
      await dependencies.sleep(retryDelay(null, attempt));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new ApiError('A solicitação falhou.', 0);
}
