import type { MobileRole, ProjectionEntity } from '../types/sync';
export type MobileResource =
  'dashboard' | 'appointment' | 'patient' | 'clinicalRecord' | 'finance' | 'document' | 'settings';
const grants: Record<MobileRole, readonly MobileResource[]> = {
  owner: ['dashboard', 'appointment', 'patient', 'finance', 'document', 'settings'],
  admin: ['dashboard', 'appointment', 'patient', 'finance', 'document', 'settings'],
  psychologist: ['dashboard', 'appointment', 'patient', 'clinicalRecord', 'document', 'settings'],
  receptionist: ['dashboard', 'appointment', 'patient', 'document', 'settings'],
  finance: ['dashboard', 'finance', 'settings'],
};
export function canAccess(role: MobileRole, resource: MobileResource) {
  return grants[role].includes(resource);
}
export function resourceForEntity(entity: ProjectionEntity): MobileResource {
  return entity === 'charge' || entity === 'payment' ? 'finance' : entity;
}
