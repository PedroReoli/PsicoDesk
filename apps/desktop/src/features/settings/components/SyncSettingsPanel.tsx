import { useEffect, useState } from 'react';
import { Button } from '../../../design-system/primitives/Button';
import { Input } from '../../../design-system/primitives/Input';
import { useAuthSession } from '../../auth/hooks/useAuthSession';
import { settingsService } from '../services/settings.service';
import type { SyncConfig, SyncDeviceIdentity, SyncStatus } from '../types/settings.types';
import styles from '../styles/settings.module.css';

const empty: SyncConfig = { endpoint: '', clinicId: '', deviceId: '', targetDeviceId: '', peerSigningPublicKey: '', peerSigningKeyFingerprint: '', keyId: '', enabled: false };

export function SyncSettingsPanel() {
  const { session } = useAuthSession();
  const [config, setConfig] = useState(empty);
  const [identity, setIdentity] = useState<SyncDeviceIdentity | null>(null);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [deviceSecret, setDeviceSecret] = useState('');
  const [encryptionKey, setEncryptionKey] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const token = session?.token;

  useEffect(() => {
    if (!token) return;
    void Promise.all([
      settingsService.getSyncConfig(token), settingsService.getSyncIdentity(token), settingsService.getSyncStatus(token),
    ]).then(([saved, ownIdentity, current]) => {
      if (saved) setConfig(saved);
      setIdentity(ownIdentity);
      setStatus(current);
    }).catch((error: unknown) => { setMessage(error instanceof Error ? error.message : 'Falha ao carregar sincronização.'); });
  }, [token]);

  const field = (key: keyof SyncConfig, value: string | boolean) => { setConfig((current) => ({ ...current, [key]: value })); };
  async function save() {
    if (!token) return;
    setBusy(true); setMessage('');
    try {
      const saved = await settingsService.updateSyncConfig(token, { ...config, ...(deviceSecret ? { deviceSecret } : {}) });
      setConfig(saved); setDeviceSecret(''); setMessage('Pareamento salvo com segurança.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao salvar pareamento.'); }
    finally { setBusy(false); }
  }
  async function start() {
    if (!token) return;
    setBusy(true); setMessage('');
    try { setStatus(await settingsService.startSync(token, encryptionKey)); setEncryptionKey(''); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao iniciar sincronização.'); }
    finally { setBusy(false); }
  }
  async function action(operation: () => Promise<SyncStatus>) {
    setBusy(true); setMessage('');
    try { setStatus(await operation()); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao controlar sincronização.'); }
    finally { setBusy(false); }
  }

  return (
    <section className={styles.card} aria-labelledby="sync-title">
      <div><h2 id="sync-title">Sincronização opcional</h2><p>O aplicativo local funciona sem servidor. Ative somente após parear os dispositivos.</p></div>
      {identity && <div className={styles.identity}><strong>Identidade pública deste computador</strong><code>{identity.signingPublicKey}</code><code>{identity.signingKeyFingerprint}</code><Button variant="ghost" onClick={() => void navigator.clipboard.writeText(`${identity.signingPublicKey}\n${identity.signingKeyFingerprint}`)}>Copiar identidade</Button></div>}
      <div className={styles.syncGrid}>
        <Input label="Endpoint HTTPS" value={config.endpoint} onChange={(e) => { field('endpoint', e.target.value); }} />
        <Input label="ID da clínica" value={config.clinicId} onChange={(e) => { field('clinicId', e.target.value); }} />
        <Input label="ID deste dispositivo" value={config.deviceId} onChange={(e) => { field('deviceId', e.target.value); }} />
        <Input label="ID do dispositivo pareado" value={config.targetDeviceId} onChange={(e) => { field('targetDeviceId', e.target.value); }} />
        <Input label="Chave pública do par" value={config.peerSigningPublicKey} onChange={(e) => { field('peerSigningPublicKey', e.target.value); }} />
        <Input label="Fingerprint do par" value={config.peerSigningKeyFingerprint} onChange={(e) => { field('peerSigningKeyFingerprint', e.target.value); }} />
        <Input label="ID da chave compartilhada" value={config.keyId} onChange={(e) => { field('keyId', e.target.value); }} />
        <Input label="Segredo do dispositivo" type="password" value={deviceSecret} onChange={(e) => { setDeviceSecret(e.target.value); }} />
      </div>
      <div className={styles.userActions}><Button disabled={busy} variant={config.enabled ? 'secondary' : 'ghost'} onClick={() => { field('enabled', !config.enabled); }}>{config.enabled ? 'Sincronização habilitada' : 'Sincronização desabilitada'}</Button><Button disabled={busy} loading={busy} onClick={() => void save()}>Salvar pareamento</Button></div>
      <div className={styles.setting}><Input label="Chave compartilhada (Base64, 32 bytes)" type="password" value={encryptionKey} onChange={(e) => { setEncryptionKey(e.target.value); }} /><Button disabled={busy || !config.enabled || !status?.configured} onClick={() => void start()}>Iniciar</Button><Button disabled={busy || !status?.running} variant="secondary" onClick={() => token && void action(() => settingsService.syncNow(token))}>Sincronizar agora</Button><Button disabled={busy || !status?.running} variant="ghost" onClick={() => token && void action(() => settingsService.stopSync(token))}>Parar</Button></div>
      {status && <p role="status">{status.running ? 'Em execução' : 'Parada'} · {String(status.pendingItems)} pendentes · {String(status.conflicts)} conflitos{status.lastError ? ` · ${status.lastError}` : ''}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
