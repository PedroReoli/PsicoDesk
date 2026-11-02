export const DEFAULT_AUTO_LOCK_MINUTES = 15;

export function readAutoLockMinutes(value: unknown) {
  if (!value || typeof value !== 'object' || !('autoLockMinutes' in value)) {
    return DEFAULT_AUTO_LOCK_MINUTES;
  }
  const minutes = (value as { autoLockMinutes?: unknown }).autoLockMinutes;
  return typeof minutes === 'number' && Number.isInteger(minutes) && minutes >= 1 && minutes <= 120
    ? minutes
    : DEFAULT_AUTO_LOCK_MINUTES;
}
