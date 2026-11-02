import { apiRequest } from '../api/client';
import { parseSession } from './sessionValidation';
async function requestSession(path: string, body: unknown) { return parseSession(await apiRequest<unknown>(path, { method: 'POST', body, retries: 0 })); }
export const authService = {
  login: (username: string, password: string) => requestSession('/v1/auth/login', { username, password }),
  refresh: (refreshToken: string) => requestSession('/v1/auth/refresh', { refreshToken }),
  logout: (accessToken: string, refreshToken: string) => apiRequest<void>('/v1/auth/logout', { method: 'POST', token: accessToken, body: { refreshToken }, retries: 0 }),
};
