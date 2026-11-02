import { apiRequest } from '../api/client';
import type { Session } from '../types/domain';
export const authService = {
  login: (username: string, password: string) => apiRequest<Session>('/v1/auth/login', { method: 'POST', body: { username, password }, retries: 0 }),
  refresh: (refreshToken: string) => apiRequest<Session>('/v1/auth/refresh', { method: 'POST', body: { refreshToken }, retries: 0 }),
  logout: (accessToken: string, refreshToken: string) => apiRequest<void>('/v1/auth/logout', { method: 'POST', token: accessToken, body: { refreshToken }, retries: 0 }),
};
