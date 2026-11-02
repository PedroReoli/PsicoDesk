import type { Role, Session } from '../types/domain';

const roles = new Set<Role>(['owner', 'admin', 'psychologist', 'receptionist', 'finance']);
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function isBoundedString(value: unknown, max: number) {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

export function parseSession(value: unknown): Session {
  if (
    !isRecord(value) ||
    !isRecord(value.user) ||
    !isBoundedString(value.accessToken, 16_384) ||
    !isBoundedString(value.refreshToken, 16_384) ||
    !isBoundedString(value.expiresAt, 100) ||
    !Number.isFinite(Date.parse(value.expiresAt as string)) ||
    !isBoundedString(value.user.id, 200) ||
    !isBoundedString(value.user.displayName, 200) ||
    typeof value.user.role !== 'string' ||
    !roles.has(value.user.role as Role)
  ) {
    throw new Error('Sessão inválida.');
  }
  return value as unknown as Session;
}

export function securityContextChanged(current: Session, next: Session) {
  return current.user.id !== next.user.id || current.user.role !== next.user.role;
}
