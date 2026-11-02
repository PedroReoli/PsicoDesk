/* eslint-disable react-hooks/set-state-in-effect -- O efeito dispara consultas assíncronas; o estado é atualizado pelo ciclo da operação. */
import { useCallback, useEffect, useState } from 'react';
import { useAuthSession } from '../../auth/hooks/useAuthSession';
import { settingsService } from '../services/settings.service';
import type { AppSetting, BackupInfo, CreateUserInput, ManagedUser } from '../types/settings.types';
export function useSettings() {
  const { session } = useAuthSession();
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const [nextSettings, nextBackups, nextUsers] = await Promise.all([
        settingsService.list(session.token),
        settingsService.listBackups(session.token),
        settingsService.listUsers(session.token).catch(() => []),
      ]);
      setSettings(nextSettings);
      setBackups(nextBackups);
      setUsers(nextUsers);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar configurações.');
    } finally {
      setLoading(false);
    }
  }, [session]);
  useEffect(() => {
    void load();
  }, [load]);
  async function update(key: string, value: unknown) {
    if (!session) throw new Error('Sessão expirada.');
    const updated = await settingsService.update(session.token, key, value);
    setSettings((current) => [...current.filter((item) => item.key !== key), updated]);
  }
  async function updateUserStatus(userId: string, status: 'active' | 'inactive') {
    if (!session) throw new Error('Sessão expirada.');
    const user = await settingsService.updateUserStatus(session.token, userId, status);
    setUsers((current) => current.map((item) => (item.id === user.id ? user : item)));
  }
  async function createBackup() {
    if (!session) throw new Error('Sessão expirada.');
    const backup = await settingsService.createBackup(session.token);
    setBackups((current) => [backup, ...current]);
  }
  async function restore(backupId: string, confirmation: string) {
    if (!session) throw new Error('Sessão expirada.');
    await settingsService.restoreBackup(session.token, backupId, confirmation);
  }
  async function createUser(input: CreateUserInput) {
    if (!session) throw new Error('Sessão expirada.');
    const user = await settingsService.createUser(session.token, input);
    setUsers((current) => [...current, user]);
  }
  return {
    settings,
    backups,
    users,
    loading,
    error,
    reload: load,
    update,
    createBackup,
    restore,
    createUser,
    updateUserStatus,
  };
}
