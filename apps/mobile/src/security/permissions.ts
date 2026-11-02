import type { Resource, Role } from '../types/domain';
const grants: Record<Role, readonly Resource[]> = {
  owner: ['dashboard', 'schedule', 'patients', 'finance', 'documents', 'settings'],
  admin: ['dashboard', 'schedule', 'patients', 'finance', 'documents', 'settings'],
  psychologist: ['dashboard', 'schedule', 'patients', 'clinical', 'documents'],
  receptionist: ['dashboard', 'schedule', 'patients', 'documents'],
  finance: ['dashboard', 'finance'],
};
export function canAccess(role: Role | undefined, resource: Resource) { return role ? grants[role].includes(resource) : false; }
