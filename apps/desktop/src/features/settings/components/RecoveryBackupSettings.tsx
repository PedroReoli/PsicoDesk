import { useEffect, useState, type SyntheticEvent } from 'react';
import { EmptyState } from '../../../design-system/composites/EmptyState';
import { RightPanel } from '../../../design-system/composites/RightPanel';
import { Button } from '../../../design-system/primitives/Button';
import { Input } from '../../../design-system/primitives/Input';
import { useAuthSession } from '../../auth/hooks/useAuthSession';
import { settingsService } from '../services/settings.service';
import styles from '../styles/settings.module.css';
import { formatBytes, type PortableBackupInfo, type RecoveryCode } from '../types/settings.types';

export function RecoveryBackupSettings() {
  const { session } = useAuthSession();
  const [backups, setBackups] = useState<PortableBackupInfo[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [selected, setSelected] = useState<PortableBackupInfo | null>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recovery, setRecovery] = useState<RecoveryCode | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [confirmationPassphrase, setConfirmationPassphrase] = useState('');
  const [restoreConfirmation, setRestoreConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !['owner', 'admin'].includes(session.user.role)) return;
    let active = true;
    void settingsService
      .listPortableBackups(session.token)
      .then((items) => {
        if (active) setBackups(items);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Falha ao listar backups.');
      });
    return () => {
      active = false;
    };
  }, [session]);

  if (!session || !['owner', 'admin'].includes(session.user.role)) return null;
  const activeSession = session;

  function clearSecrets() {
    setPassphrase('');
    setConfirmationPassphrase('');
    setRestoreConfirmation('');
    setError(null);
  }

  async function exportBackup(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passphrase !== confirmationPassphrase) {
      setError('As frases secretas não coincidem.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await settingsService.exportPortableBackup(activeSession.token, passphrase);
      setBackups((current) => [created, ...current]);
      setExportOpen(false);
      clearSecrets();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível exportar o backup.');
    } finally {
      setBusy(false);
    }
  }

  async function restoreBackup(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await settingsService.restorePortableBackup(
        activeSession.token,
        selected.id,
        passphrase,
        restoreConfirmation,
      );
      setSelected(null);
      clearSecrets();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível restaurar o backup.');
    } finally {
      setBusy(false);
    }
  }

  async function generateRecoveryCode() {
    setBusy(true);
    setError(null);
    try {
      setRecovery(await settingsService.generateRecoveryCode(activeSession.token));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível gerar o código.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {activeSession.user.role === 'owner' && (
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h2>Recuperação do proprietário</h2>
              <p>Gere um código de uso único para recuperar a senha sem internet.</p>
            </div>
            <Button onClick={() => { setRecoveryOpen(true); }}>Gerenciar código</Button>
          </div>
          <p className={styles.warning}>Guarde o código fora deste computador. Ele só será exibido uma vez e o anterior será invalidado.</p>
        </section>
      )}
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div>
            <h2>Backup portátil</h2>
            <p>Criptografado por frase secreta para restauração em outro perfil ou computador.</p>
          </div>
          <Button onClick={() => { setExportOpen(true); }}>Exportar backup portátil</Button>
        </div>
        {error && !exportOpen && !selected && !recoveryOpen && <p className={styles.error} role="alert">{error}</p>}
        {backups.length === 0 ? (
          <EmptyState title="Nenhum backup portátil" description="A primeira exportação será salva em Documentos/PsicoDesk/Backups." />
        ) : (
          <div className={styles.backups}>
            {backups.map((item) => (
              <article key={item.id}>
                <div>
                  <strong>{new Date(item.createdAt).toLocaleString('pt-BR')}</strong>
                  <p>{formatBytes(item.sizeBytes)} · {item.directory}</p>
                </div>
                <Button variant="ghost" onClick={() => { clearSecrets(); setSelected(item); }}>Restaurar</Button>
              </article>
            ))}
          </div>
        )}
      </section>

      <RightPanel open={exportOpen} title="Exportar backup portátil" description="A frase secreta não é armazenada e será exigida na restauração." onClose={() => { setExportOpen(false); clearSecrets(); }}>
        <form className={styles.form} onSubmit={exportBackup}>
          <Input label="Frase secreta" type="password" minLength={16} maxLength={256} value={passphrase} onChange={(event) => { setPassphrase(event.target.value); }} required autoComplete="new-password" />
          <Input label="Confirmar frase secreta" type="password" minLength={16} maxLength={256} value={confirmationPassphrase} onChange={(event) => { setConfirmationPassphrase(event.target.value); }} required autoComplete="new-password" />
          {error && <p className={styles.error} role="alert">{error}</p>}
          <Button type="submit" loading={busy} fullWidth>Exportar para Documentos</Button>
        </form>
      </RightPanel>

      <RightPanel open={Boolean(selected)} title="Restaurar backup portátil" description="Os dados atuais recebem uma cópia de segurança antes da restauração." onClose={() => { setSelected(null); clearSecrets(); }}>
        <form className={styles.form} onSubmit={restoreBackup}>
          <Input label="Frase secreta do backup" type="password" minLength={16} maxLength={256} value={passphrase} onChange={(event) => { setPassphrase(event.target.value); }} required autoComplete="current-password" />
          <Input label="Digite RESTAURAR BACKUP PORTÁTIL" value={restoreConfirmation} onChange={(event) => { setRestoreConfirmation(event.target.value); }} required autoComplete="off" />
          {error && <p className={styles.error} role="alert">{error}</p>}
          <Button type="submit" loading={busy} fullWidth>Restaurar e encerrar sessões</Button>
        </form>
      </RightPanel>

      <RightPanel open={recoveryOpen} title="Código de recuperação" description="Apenas o hash do código fica armazenado localmente." onClose={() => { setRecoveryOpen(false); setRecovery(null); setError(null); }}>
        <div className={styles.form}>
          {!recovery ? (
            <>
              <p className={styles.warning}>Ao gerar um novo código, qualquer código anterior deixa de funcionar.</p>
              {error && <p className={styles.error} role="alert">{error}</p>}
              <Button loading={busy} onClick={() => void generateRecoveryCode()} fullWidth>Gerar novo código</Button>
            </>
          ) : (
            <>
              <p className={styles.warning}>Copie agora e guarde offline. Ao fechar este painel, o código não será mostrado novamente.</p>
              <code className={styles.recoveryCode}>{recovery.code}</code>
              <p>Válido até {new Date(recovery.expiresAt).toLocaleDateString('pt-BR')}.</p>
              <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(recovery.code)} fullWidth>Copiar código</Button>
            </>
          )}
        </div>
      </RightPanel>
    </>
  );
}
