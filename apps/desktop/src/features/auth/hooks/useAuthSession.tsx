import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { authService } from '../services/auth.service';
import type { BootstrapAdminInput, LoginInput, Session } from '../types/auth.types';
import { DEFAULT_AUTO_LOCK_MINUTES, readAutoLockMinutes } from '../sessionPolicy';
import { SESSION_INVALID_EVENT } from '../../../shared/services/tauriClient';

interface AuthContextValue {
  session: Session | null;
  busy: boolean;
  error: string | null;
  login: (input: LoginInput) => Promise<void>;
  bootstrap: (input: BootstrapAdminInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível concluir a autenticação.';
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoLockMinutes, setAutoLockMinutes] = useState(DEFAULT_AUTO_LOCK_MINUTES);

  const execute = useCallback(async (operation: () => Promise<Session>) => {
    setBusy(true);
    setError(null);
    try {
      const nextSession = await operation();
      setSession(nextSession);
      const policy = await authService.getSessionPolicy(nextSession.token).catch(() => null);
      setAutoLockMinutes(readAutoLockMinutes(policy?.value));
    } catch (cause) {
      setError(errorMessage(cause));
      throw cause;
    } finally {
      setBusy(false);
    }
  }, []);

  const login = useCallback(
    (input: LoginInput) => execute(() => authService.login(input)),
    [execute],
  );
  const bootstrap = useCallback(
    (input: BootstrapAdminInput) => execute(() => authService.bootstrapAdmin(input)),
    [execute],
  );
  const logout = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    try {
      await authService.logout(session.token);
    } finally {
      setSession(null);
      setBusy(false);
    }
  }, [session]);

  useEffect(() => {
    const invalidate = () => {
      setSession(null);
      setError('Sua sessão expirou. Entre novamente.');
    };
    window.addEventListener(SESSION_INVALID_EVENT, invalidate);
    return () => {
      window.removeEventListener(SESSION_INVALID_EVENT, invalidate);
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    let timer = window.setTimeout(() => void logout(), autoLockMinutes * 60 * 1000);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void logout(), autoLockMinutes * 60 * 1000);
    };
    const events = ['pointerdown', 'keydown', 'focus'] as const;
    events.forEach((event) => {
      window.addEventListener(event, reset, { passive: true });
    });
    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => {
        window.removeEventListener(event, reset);
      });
    };
  }, [session, logout, autoLockMinutes]);

  const value = useMemo(
    () => ({ session, busy, error, login, bootstrap, logout }),
    [session, busy, error, login, bootstrap, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- O provider e seu hook formam um contrato único de contexto.
export function useAuthSession() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuthSession deve ser usado dentro de AuthProvider.');
  return context;
}
