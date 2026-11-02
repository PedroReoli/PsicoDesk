import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { ApiError } from '../api/client';
import { clearProtectedCache } from '../database/cacheRepository';
import { deleteDataKey } from '../security/dataCipher';
import type { DeviceCredentials, DeviceSession } from '../types/sync';
import { issueDeviceToken, registerDevice } from './authService';
import type { ProvisioningInput } from './provisioningValidation';
import { deleteDevice, readDevice, saveDevice } from './sessionStorage';
import { purgeDevice } from './deviceCleanup';

interface AuthValue { session: DeviceSession | null; loading: boolean; error: string | null; provision: (input: ProvisioningInput) => Promise<void>; getAccessToken: () => Promise<string>; credentials: DeviceCredentials | null; logout: () => Promise<void>; }
const AuthContext = createContext<AuthValue | null>(null);
function toSession(credentials: DeviceCredentials, accessToken: string | null, expiresAt: string | null): DeviceSession { return { serverUrl: credentials.serverUrl, clinicId: credentials.clinicId, deviceId: credentials.deviceId, deviceName: credentials.deviceName, role: credentials.role, accessToken, expiresAt }; }
async function purgeLocalDevice() { await purgeDevice({ deleteCredentials: deleteDevice, clearDatabase: clearProtectedCache, deleteLocalKey: () => deleteDataKey().catch(() => undefined) }); }
export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<DeviceSession | null>(null); const [credentials, setCredentials] = useState<DeviceCredentials | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const credentialsRef = useRef<DeviceCredentials | null>(null); const sessionRef = useRef<DeviceSession | null>(null);
  const apply = useCallback((nextCredentials: DeviceCredentials | null, nextSession: DeviceSession | null) => { credentialsRef.current = nextCredentials; sessionRef.current = nextSession; setCredentials(nextCredentials); setSession(nextSession); }, []);
  const refreshToken = useCallback(async (current: DeviceCredentials) => { const token = await issueDeviceToken(current); const next = toSession(current, token.accessToken, token.expiresAt); await saveDevice({ credentials: current, ...token }); apply(current, next); return token.accessToken; }, [apply]);
  useEffect(() => { void (async () => { try { const stored = await readDevice(); if (!stored) return; const offlineSession = toSession(stored.credentials, stored.accessToken, stored.expiresAt); apply(stored.credentials, offlineSession); const validUntil = stored.expiresAt ? Date.parse(stored.expiresAt) : 0; if (!stored.accessToken || validUntil <= Date.now() + 60_000) await refreshToken(stored.credentials); } catch (cause) { if (cause instanceof ApiError && cause.code === 'AUTH_REQUIRED') { await purgeLocalDevice(); apply(null, null); setError('O dispositivo não está mais autorizado. Provisione novamente.'); } } finally { setLoading(false); } })(); }, [apply, refreshToken]);
  const provision = useCallback(async (input: ProvisioningInput) => { setLoading(true); setError(null); try { const nextCredentials = await registerDevice(input); const token = await issueDeviceToken(nextCredentials); await purgeLocalDevice(); await saveDevice({ credentials: nextCredentials, ...token }); apply(nextCredentials, toSession(nextCredentials, token.accessToken, token.expiresAt)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível provisionar o dispositivo.'); throw cause; } finally { setLoading(false); } }, [apply]);
  const getAccessToken = useCallback(async () => { const currentCredentials = credentialsRef.current; const currentSession = sessionRef.current; if (!currentCredentials || !currentSession) throw new ApiError('Dispositivo não provisionado.', 401, 'AUTH_REQUIRED'); if (currentSession.accessToken && currentSession.expiresAt && Date.parse(currentSession.expiresAt) > Date.now() + 60_000) return currentSession.accessToken; return refreshToken(currentCredentials); }, [refreshToken]);
  const logout = useCallback(async () => { apply(null, null); await purgeLocalDevice(); }, [apply]);
  const value = useMemo(() => ({ session, loading, error, provision, getAccessToken, credentials, logout }), [session, loading, error, provision, getAccessToken, credentials, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('useAuth deve ser usado dentro de AuthProvider.'); return value; }
