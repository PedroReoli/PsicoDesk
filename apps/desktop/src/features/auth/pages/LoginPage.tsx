import { useState, type SyntheticEvent } from 'react';
import { Button } from '../../../design-system/primitives/Button';
import { Input } from '../../../design-system/primitives/Input';
import { useAuthSession } from '../hooks/useAuthSession';
import styles from '../styles/auth.module.css';

export function LoginPage() {
  const { login, bootstrap, busy, error } = useAuthSession();
  const [firstAccess, setFirstAccess] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (firstAccess) await bootstrap({ displayName, username, password });
      else await login({ username, password });
    } catch {
      // O provider apresenta a falha com mensagem segura no próprio formulário.
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
        <div className={styles.mode} role="group" aria-label="Tipo de acesso">
          <Button
            variant={firstAccess ? 'ghost' : 'primary'}
            onClick={() => {
              setFirstAccess(false);
            }}
          >
            Entrar
          </Button>
          <Button
            variant={firstAccess ? 'primary' : 'ghost'}
            onClick={() => {
              setFirstAccess(true);
            }}
          >
            Primeiro acesso
          </Button>
        </div>
        <div>
          <p className={styles.eyebrow}>{firstAccess ? 'Configuração inicial' : 'Área segura'}</p>
          <h2>{firstAccess ? 'Criar administrador local' : 'Boas-vindas de volta'}</h2>
        </div>
        <form className={styles.form} onSubmit={submit}>
          {firstAccess && (
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
          <Input
            label="Senha"
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
            minLength={10}
            required
            autoComplete={firstAccess ? 'new-password' : 'current-password'}
          />
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <Button type="submit" loading={busy} fullWidth>
            {firstAccess ? 'Criar acesso seguro' : 'Entrar no PsicoDesk'}
          </Button>
        </form>
      </section>
    </main>
  );
}
