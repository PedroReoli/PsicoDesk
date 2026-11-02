import { useState, type SyntheticEvent } from 'react';
import { Button } from '../../../design-system/primitives/Button';
import { Input } from '../../../design-system/primitives/Input';
import type { CreateUserInput, ManagedUserRole } from '../types/settings.types';
import styles from '../styles/settings.module.css';
export function UserForm({ onSubmit }: { onSubmit: (input: CreateUserInput) => Promise<void> }) {
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<ManagedUserRole>('psychologist');
  const [registration, setRegistration] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        displayName,
        username,
        password,
        role,
        professionalRegistration: registration.length ? registration : undefined,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao criar usuário.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={styles.form} onSubmit={submit}>
      <Input
        label="Nome de exibição"
        value={displayName}
        onChange={(event) => {
          setDisplayName(event.target.value);
        }}
        required
      />
      <Input
        label="Usuário"
        value={username}
        onChange={(event) => {
          setUsername(event.target.value);
        }}
        required
      />
      <Input
        label="Senha temporária"
        type="password"
        minLength={12}
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
        }}
        required
      />
      <fieldset className={styles.choiceGroup}>
        <legend>Perfil</legend>
        <div role="radiogroup" aria-label="Perfil do usuário">
          {(
            [
              ['psychologist', 'Psicólogo'],
              ['receptionist', 'Recepção'],
              ['finance', 'Financeiro'],
              ['admin', 'Administrador'],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              variant={role === value ? 'primary' : 'ghost'}
              role="radio"
              aria-checked={role === value}
              onClick={() => {
                setRole(value);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </fieldset>
      {role === 'psychologist' && (
        <Input
          label="Registro profissional"
          value={registration}
          onChange={(event) => {
            setRegistration(event.target.value);
          }}
          required
        />
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <Button type="submit" loading={busy} fullWidth>
        Criar usuário
      </Button>
    </form>
  );
}
