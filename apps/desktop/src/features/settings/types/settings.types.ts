export interface AppSetting {
  key: string;
  value: unknown;
  updatedAt: string;
}
export interface BackupInfo {
  id: string;
  createdAt: string;
  sizeBytes: number;
}
export type ManagedUserRole = 'admin' | 'psychologist' | 'receptionist' | 'finance';
export interface ManagedUser {
  id: string;
  displayName: string;
  username: string;
  role: ManagedUserRole | 'owner';
  professionalRegistration?: string | null;
  status: string;
  createdAt: string;
}
export interface CreateUserInput {
  displayName: string;
  username: string;
  password: string;
  role: ManagedUserRole;
  professionalRegistration?: string | undefined;
}
export interface SyncConfig {
  endpoint: string;
  clinicId: string;
  deviceId: string;
  targetDeviceId: string;
  peerSigningPublicKey: string;
  peerSigningKeyFingerprint: string;
  enabled: boolean;
}
export interface SyncDeviceIdentity {
  signingPublicKey: string;
  signingKeyFingerprint: string;
}
export interface SyncStatus {
  configured: boolean;
  enabled: boolean;
  running: boolean;
  websocketConnected: boolean;
  pendingItems: number;
  conflicts: number;
  lastSyncAt?: string | null;
  lastError?: string | null;
}
export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
