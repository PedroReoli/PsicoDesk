import type { PropsWithChildren } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { canAccess } from '../security/permissions';
import type { Resource } from '../types/domain';
import { StateView } from './StateView';
export function RoleGate({ resource, children }: PropsWithChildren<{ resource: Resource }>) {
  const { session } = useAuth();
  return canAccess(session?.user.role, resource) ? (
    children
  ) : (
    <StateView
      state="error"
      title="Acesso restrito"
      description="Seu perfil não possui permissão para acessar esta área."
    />
  );
}
