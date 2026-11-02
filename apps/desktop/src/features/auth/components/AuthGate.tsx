import type { PropsWithChildren } from 'react';
import { useAuthSession } from '../hooks/useAuthSession';
import { LoginPage } from '../pages/LoginPage';

export function AuthGate({ children }: PropsWithChildren) {
  const { session } = useAuthSession();
  return session ? children : <LoginPage />;
}
