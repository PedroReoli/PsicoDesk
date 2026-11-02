import { AppShell } from '../design-system/layouts/AppShell';
import { useAuthSession } from '../features/auth/hooks/useAuthSession';

export function AuthenticatedAppShell() {
  const { session, logout } = useAuthSession();

  return (
    <AppShell
      userDisplayName={session?.user.displayName ?? 'Profissional'}
      userRole={session?.user.role ?? 'psychologist'}
      onLogout={logout}
    />
  );
}
