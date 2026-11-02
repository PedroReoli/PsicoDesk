import { invokeCommand } from '../../../shared/services/tauriClient';
import type { BootstrapAdminInput, LoginInput, RecoverPasswordInput, Session } from '../types/auth.types';

export const authService = {
  needsBootstrap() {
    return invokeCommand<boolean>('needs_bootstrap');
  },
  login(input: LoginInput) {
    return invokeCommand<Session>('login', { input });
  },
  bootstrapAdmin(input: BootstrapAdminInput) {
    return invokeCommand<Session>('bootstrap_admin', { input });
  },
  logout(sessionToken: string) {
    return invokeCommand<unknown>('logout', { sessionToken });
  },
  getSession(sessionToken: string) {
    return invokeCommand<Session>('get_session', { sessionToken });
  },
  getSessionPolicy(sessionToken: string) {
    return invokeCommand<{ value: unknown }>('get_session_policy', { sessionToken });
  },
  recoverPassword(input: RecoverPasswordInput) {
    return invokeCommand<unknown>('recover_password', { input });
  },
};
