import { invokeCommand } from '../../../shared/services/tauriClient';
import type { AppSetting, BackupInfo, CreateUserInput, ManagedUser, SyncConfig, SyncDeviceIdentity, SyncStatus } from '../types/settings.types';
export const settingsService = {
  list: (sessionToken: string) => invokeCommand<AppSetting[]>('get_app_settings', { sessionToken }),
  update: (sessionToken: string, key: string, value: unknown) =>
    invokeCommand<AppSetting>('update_app_setting', { sessionToken, input: { key, value } }),
  listBackups: (sessionToken: string) =>
    invokeCommand<BackupInfo[]>('list_backups', { sessionToken }),
  createBackup: (sessionToken: string) =>
    invokeCommand<BackupInfo>('create_backup', { sessionToken }),
  restoreBackup: (sessionToken: string, backupId: string, confirmation: string) =>
    invokeCommand<unknown>('restore_backup', { sessionToken, input: { backupId, confirmation } }),
  listUsers: (sessionToken: string) => invokeCommand<ManagedUser[]>('list_users', { sessionToken }),
  createUser: (sessionToken: string, input: CreateUserInput) =>
    invokeCommand<ManagedUser>('create_user', { sessionToken, input }),
  updateUserStatus: (sessionToken: string, userId: string, status: string) =>
    invokeCommand<ManagedUser>('update_user_status', { sessionToken, userId, input: { status } }),
  getSyncConfig: (sessionToken: string) =>
    invokeCommand<SyncConfig | null>('get_sync_config', { sessionToken }),
  getSyncIdentity: (sessionToken: string) =>
    invokeCommand<SyncDeviceIdentity>('get_sync_device_identity', { sessionToken }),
  updateSyncConfig: (sessionToken: string, input: SyncConfig & { deviceSecret?: string }) =>
    invokeCommand<SyncConfig>('update_sync_config', { sessionToken, input }),
  getSyncStatus: (sessionToken: string) =>
    invokeCommand<SyncStatus>('get_sync_status', { sessionToken }),
  startSync: (sessionToken: string, encryptionKeyBase64: string) =>
    invokeCommand<SyncStatus>('start_sync', { sessionToken, input: { encryptionKeyBase64 } }),
  stopSync: (sessionToken: string) =>
    invokeCommand<SyncStatus>('stop_sync', { sessionToken }),
  syncNow: (sessionToken: string) =>
    invokeCommand<SyncStatus>('sync_now', { sessionToken }),
};
