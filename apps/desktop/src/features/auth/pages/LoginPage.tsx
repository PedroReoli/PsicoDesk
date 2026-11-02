import { useEffect, useState, type SyntheticEvent } from 'react';
import { Button } from '../../../design-system/primitives/Button';
import { Input } from '../../../design-system/primitives/Input';
import { useAuthSession } from '../hooks/useAuthSession';
import { authService } from '../services/auth.service';
import styles from '../styles/auth.module.css';

export function LoginPage() {
  const { login, bootstrap, busy, error } = useAuthSession();
  const [firstAccess, setFirstAccess] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoverySuccess, setRecoverySuccess] = useState(false);
  const [recoveringBusy, setRecoveringBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void authService
      .needsBootstrap()
      .then((needed) => {
        if (active) setFirstAccess(needed);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setCheckingAccess(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (recovering) {
        setRecoveringBusy(true);
        setRecoveryError(null);
        await authService.recoverPassword({ username, recoveryCode, newPassword: password });
        setRecoverySuccess(true);
        setRecovering(false);
        setRecoveryCode('');
        setPassword('');
      } else if (firstAccess) await bootstrap({ displayName, username, password });
      else await login({ username, password });
    } catch (cause) {
      if (recovering) {
        setRecoveryError(cause instanceof Error ? cause.message : 'Não foi possível recuperar o acesso.');
      }
    } finally {
      setRecoveringBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.brand} aria-labelledby="welcome-title">
        <span className={styles.mark} aria-hidden="true">
          Ψ
        </span>
        <p>PsicoDesk</p>
        <h1 id="welcome-title">A clínica organizada, com os dados no seu computador.</h1>
        <p>Agenda, pacientes, prontuários e financeiro em uma experiência offline e protegida.</p>
      </section>
      <section className={styles.card} aria-label="Acesso ao PsicoDesk">
        {checkingAccess && <p role="status">Verificando configuração local…</p>}
        <div className={styles.mode} role="group" aria-label="Tipo de acesso">
          <Button
            variant={!firstAccess && !recovering ? 'primary' : 'ghost'}
            onClick={() => {
              setFirstAccess(false);
              setRecovering(false);
            }}
          >
            Entrar
          </Button>
          <Button
            variant={firstAccess && !recovering ? 'primary' : 'ghost'}
            onClick={() => {
              setFirstAccess(true);
              setRecovering(false);
            }}
          >
            Primeiro acesso
          </Button>
          <Button
            variant={recovering ? 'primary' : 'ghost'}
            onClick={() => {
              setFirstAccess(false);
              setRecovering(true);
              setRecoveryError(null);
              setRecoverySuccess(false);
            }}
          >
            Recuperar
          </Button>
        </div>
        <div>
          <p className={styles.eyebrow}>{recovering ? 'Recuperação offline' : firstAccess ? 'Configuração inicial' : 'Área segura'}</p>
          <h2>{recovering ? 'Definir uma nova senha' : firstAccess ? 'Criar administrador local' : 'Boas-vindas de volta'}</h2>
        </div>
        {recoverySuccess && <p className={styles.success} role="status">Senha atualizada. Entre com a nova credencial.</p>}
        <form className={styles.form} onSubmit={submit}>
          {firstAccess && !recovering && (
            <Input
              label="Nome de exibição"
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value);
              }}
              required
              autoComplete="name"
            />
          )}
          <Input
            label="Usuário"
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
            }}
            required
            autoComplete="username"
          />
          {recovering && (
            <Input
              label="Código de recuperação"
              value={recoveryCode}
              onChange={(event) => {
                setRecoveryCode(event.target.value);
              }}
              minLength={48}
              maxLength={64}
              required
              autoComplete="off"
            />
          )}
          <Input
            label={recovering ? 'Nova senha' : 'Senha'}
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
            minLength={12}
            required
            autoComplete={firstAccess || recovering ? 'new-password' : 'current-password'}
          />
          {(recovering ? recoveryError : error) && (
            <p className={styles.error} role="alert">
              {recovering ? recoveryError : error}
            </p>
          )}
          <Button type="submit" loading={recovering ? recoveringBusy : busy} fullWidth>
            {recovering ? 'Atualizar senha' : firstAccess ? 'Criar acesso seguro' : 'Entrar no PsicoDesk'}
          </Button>
        </form>
      </section>
    </main>
  );
}
