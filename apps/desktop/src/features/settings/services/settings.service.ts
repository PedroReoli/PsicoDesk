import { invokeCommand } from '../../../shared/services/tauriClient';
import type { AppSetting, BackupInfo, CreateUserInput, ManagedUser } from '../types/settings.types';
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
};
