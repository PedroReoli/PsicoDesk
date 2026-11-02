import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { clearProtectedCache } from '../database/cacheRepository';
import type { Session } from '../types/domain';
import { authService } from './authService';
import { deleteSession, readSession, saveSession } from './sessionStorage';
import { deleteDataKey } from '../security/dataCipher';
import { securityContextChanged } from './sessionValidation';
interface AuthValue {
  session: Session | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}
const AuthContext = createContext<AuthValue | null>(null);
async function clearProtectedData() {
  await clearProtectedCache().catch(() => undefined);
  await deleteDataKey();
}
async function purgeLocalSession() {
  await Promise.allSettled([deleteSession(), clearProtectedData()]);
}
export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      try {
        const stored = await readSession();
        if (stored && new Date(stored.expiresAt) > new Date()) setSession(stored);
        else if (stored) {
          try {
            const refreshed = await authService.refresh(stored.refreshToken);
            if (securityContextChanged(stored, refreshed)) await clearProtectedData();
            await saveSession(refreshed);
            setSession(refreshed);
          } catch {
            await purgeLocalSession();
          }
        } else await purgeLocalSession();
      } catch {
        setSession(null);
        await purgeLocalSession().catch(() => undefined);
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  const login = useCallback(async (username: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const next = await authService.login(username, password);
      await saveSession(next);
      setSession(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível entrar.');
      throw cause;
    } finally {
      setLoading(false);
    }
  }, []);
  const logout = useCallback(async () => {
    const current = session;
    setSession(null);
    await Promise.allSettled([
      current ? authService.logout(current.accessToken, current.refreshToken) : Promise.resolve(),
      purgeLocalSession(),
    ]);
  }, [session]);
  useEffect(() => {
    if (!session) return;
    const refreshIn = Math.max(5_000, new Date(session.expiresAt).getTime() - Date.now() - 60_000);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const refreshed = await authService.refresh(session.refreshToken);
          if (securityContextChanged(session, refreshed)) await clearProtectedData();
          await saveSession(refreshed);
          setSession(refreshed);
        } catch {
          setSession(null);
          await purgeLocalSession().catch(() => undefined);
        }
      })();
    }, refreshIn);
    return () => clearTimeout(timer);
  }, [session]);
  const value = useMemo(
    () => ({ session, loading, error, login, logout }),
    [session, loading, error, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return value;
}
