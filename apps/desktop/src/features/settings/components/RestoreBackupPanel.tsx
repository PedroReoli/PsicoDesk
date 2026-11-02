import { useState, type SyntheticEvent } from 'react';
import { Button } from '../../../design-system/primitives/Button';
import { Input } from '../../../design-system/primitives/Input';
import styles from '../styles/settings.module.css';
export function RestoreBackupPanel({
  onRestore,
}: {
  onRestore: (confirmation: string) => Promise<void>;
}) {
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmation !== 'RESTAURAR BACKUP') {
      setError('Digite exatamente RESTAURAR BACKUP.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onRestore(confirmation);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao restaurar backup.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.danger}>
        <strong>A restauração substitui os dados atuais.</strong>
        <p>O PsicoDesk validará a integridade da cópia antes de aplicar qualquer alteração.</p>
      </div>
      <Input
        label="Confirmação"
        value={confirmation}
        onChange={(event) => {
          setConfirmation(event.target.value);
        }}
        placeholder="RESTAURAR BACKUP"
        autoComplete="off"
      />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <Button
        type="submit"
        variant="danger"
        loading={busy}
        disabled={confirmation !== 'RESTAURAR BACKUP'}
        fullWidth
      >
        Restaurar esta cópia
      </Button>
    </form>
  );
}
