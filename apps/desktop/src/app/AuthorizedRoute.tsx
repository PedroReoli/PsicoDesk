import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { useAuthSession } from '../features/auth/hooks/useAuthSession';
import { canViewNavigationItem } from '../shared/constants/navigation';

interface AuthorizedRouteProps {
  path: string;
  children: ReactNode;
}

export function AuthorizedRoute({ path, children }: AuthorizedRouteProps) {
  const { session } = useAuthSession();

  if (!session || !canViewNavigationItem(session.user.role, path)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
