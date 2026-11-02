import { invokeCommand } from '../../../shared/services/tauriClient';
import type { BootstrapAdminInput, LoginInput, Session } from '../types/auth.types';

export const authService = {
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
};
