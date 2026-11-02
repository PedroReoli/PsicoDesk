import { useMemo, useState } from 'react';
import { EmptyState } from '../../../design-system/composites/EmptyState';
import { PageHeader } from '../../../design-system/composites/PageHeader';
import { RightPanel } from '../../../design-system/composites/RightPanel';
import { Button } from '../../../design-system/primitives/Button';
import { Input } from '../../../design-system/primitives/Input';
import { RestoreBackupPanel } from '../components/RestoreBackupPanel';
import { UserForm } from '../components/UserForm';
import { useSettings } from '../hooks/useSettings';
import { formatBytes, type BackupInfo } from '../types/settings.types';
import styles from '../styles/settings.module.css';

const roleLabel = {
  owner: 'Proprietário',
  admin: 'Administrador',
  psychologist: 'Psicólogo',
  receptionist: 'Recepção',
  finance: 'Financeiro',
} as const;

export default function SettingsPage() {
  const {
    settings,
    backups,
    users,
    loading,
    error,
    reload,
    update,
    createBackup,
    restore,
    createUser,
  } = useSettings();
  const [selected, setSelected] = useState<BackupInfo | null>(null);
  const [userPanel, setUserPanel] = useState(false);
  const [creating, setCreating] = useState(false);
  const [autoLock, setAutoLock] = useState('15');
  const values = useMemo(
    () => Object.fromEntries(settings.map((item) => [item.key, item.value])),
    [settings],
  );

  const configuredAutoLock =
    typeof values.autoLockMinutes === 'number' ? String(values.autoLockMinutes) : '15';
  const autoLockValue = autoLock || configuredAutoLock;

  async function backup() {
    setCreating(true);
    try {
      await createBackup();
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className={styles.page}>
      <PageHeader
        eyebrow="Administração local"
        title="Configurações"
        description="Segurança, usuários e cópias protegidas deste computador."
      />
      {loading ? (
        <div className={styles.state}>Carregando configurações…</div>
      ) : error ? (
        <div className={styles.state}>
          <p role="alert">{error}</p>
          <Button onClick={() => void reload()}>Tentar novamente</Button>
        </div>
      ) : (
        <>
          <section className={styles.card}>
            <div>
              <h2>Sessão e privacidade</h2>
              <p>Bloqueie automaticamente o acesso quando o computador ficar inativo.</p>
            </div>
            <div className={styles.setting}>
              <Input
                label="Bloqueio por inatividade (minutos)"
                type="number"
                min="1"
                max="120"
                value={autoLockValue}
                onChange={(event) => {
                  setAutoLock(event.target.value);
                }}
              />
              <Button
                variant="secondary"
                onClick={() => void update('autoLockMinutes', Number(autoLockValue))}
              >
                Salvar
              </Button>
            </div>
          </section>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h2>Usuários e perfis</h2>
                <p>O backend aplica as permissões de cada perfil em todos os comandos.</p>
              </div>
              <Button
                onClick={() => {
                  setUserPanel(true);
                }}
              >
                Novo usuário
              </Button>
            </div>
            {users.length === 0 ? (
              <EmptyState
                title="Gestão indisponível para este perfil"
                description="Somente administradores autorizados podem consultar e criar usuários."
              />
            ) : (
              <div className={styles.backups}>
                {users.map((user) => (
                  <article key={user.id}>
                    <div>
                      <strong>{user.displayName}</strong>
                      <p>
                        @{user.username} · {roleLabel[user.role]}
                      </p>
                    </div>
                    <span>{user.status === 'active' ? 'Ativo' : 'Inativo'}</span>
                  </article>
                ))}
              </div>
            )}
          </section>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h2>Backups criptografados</h2>
                <p>As cópias permanecem na área privada do PsicoDesk neste computador.</p>
              </div>
              <Button loading={creating} onClick={() => void backup()}>
                Criar backup agora
              </Button>
            </div>
            {backups.length === 0 ? (
              <EmptyState
                title="Nenhum backup disponível"
                description="Crie a primeira cópia para testar o processo de recuperação."
              />
            ) : (
              <div className={styles.backups}>
                {backups.map((item) => (
                  <article key={item.id}>
                    <div>
                      <strong>{new Date(item.createdAt).toLocaleString('pt-BR')}</strong>
                      <p>{formatBytes(item.sizeBytes)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setSelected(item);
                      }}
                    >
                      Restaurar
                    </Button>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
      <RightPanel
        open={userPanel}
        title="Novo usuário"
        description="Crie uma credencial individual com o menor privilégio necessário."
        onClose={() => {
          setUserPanel(false);
        }}
      >
        <UserForm
          onSubmit={async (input) => {
            await createUser(input);
            setUserPanel(false);
          }}
        />
      </RightPanel>
      <RightPanel
        open={Boolean(selected)}
        title="Confirmar restauração"
        description={
          selected
            ? `Cópia criada em ${new Date(selected.createdAt).toLocaleString('pt-BR')}`
            : undefined
        }
        onClose={() => {
          setSelected(null);
        }}
      >
        {selected && (
          <RestoreBackupPanel
            onRestore={async (confirmation) => {
              await restore(selected.id, confirmation);
              setSelected(null);
            }}
          />
        )}
      </RightPanel>
    </section>
  );
}
