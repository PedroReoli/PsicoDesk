import { useState } from 'react';
import { PageHeader } from '../../../design-system/composites/PageHeader';
import { RightPanel } from '../../../design-system/composites/RightPanel';
import { EmptyState } from '../../../design-system/composites/EmptyState';
import { Button } from '../../../design-system/primitives/Button';
import { Input } from '../../../design-system/primitives/Input';
import { Badge } from '../../../design-system/primitives/Badge';
import { PatientForm } from '../components/PatientForm';
import { usePatients } from '../hooks/usePatients';
import type { Patient } from '../types/patient.types';
import styles from '../styles/patients.module.css';

export default function PatientsPage() {
  const [query, setQuery] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const { patients, loading, error, reload, create, update } = usePatients(query);

  return (
    <section className={styles.page}>
      <PageHeader
        eyebrow="Cadastros"
        title="Pacientes"
        description="Dados de identificação e contato, separados dos registros clínicos."
        actions={
          <Button
            onClick={() => {
              setPanelOpen(true);
            }}
          >
            Novo paciente
          </Button>
        }
      />
      <div className={styles.toolbar}>
        <Input
          aria-label="Buscar pacientes"
          placeholder="Buscar por nome"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
      </div>
      {loading ? (
        <div className={styles.state} role="status">
          Carregando pacientes…
        </div>
      ) : error ? (
        <div className={styles.state}>
          <p role="alert">{error}</p>
          <Button variant="secondary" onClick={() => void reload()}>
            Tentar novamente
          </Button>
        </div>
      ) : patients.length === 0 ? (
        <EmptyState
          title="Nenhum paciente encontrado"
          description={
            query
              ? 'Revise o termo pesquisado.'
              : 'Cadastre o primeiro paciente para iniciar a operação.'
          }
          action={
            !query && (
              <Button
                onClick={() => {
                  setPanelOpen(true);
                }}
              >
                Cadastrar paciente
              </Button>
            )
          }
        />
      ) : (
        <div className={styles.list}>
          {patients.map((patient) => (
            <article className={styles.patient} key={patient.id}>
              <div className={styles.avatar} aria-hidden="true">
                {patient.fullName.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h2>{patient.socialName ?? patient.fullName}</h2>
                <p>
                  {patient.socialName
                    ? patient.fullName
                    : (patient.email ?? 'Sem e-mail cadastrado')}
                </p>
              </div>
              <Badge tone={patient.status === 'active' ? 'success' : 'neutral'}>
                {patient.status === 'active' ? 'Ativo' : 'Inativo'}
              </Badge>
              <Button variant="ghost" onClick={() => { setEditing(patient); setPanelOpen(true); }}>Editar</Button>
            </article>
          ))}
        </div>
      )}
      <RightPanel
        open={panelOpen}
        title={editing ? 'Editar paciente' : 'Novo paciente'}
        description="Somente informações cadastrais. O prontuário possui acesso separado."
        onClose={() => {
          setPanelOpen(false);
          setEditing(null);
        }}
        footer={null}
      >
        <PatientForm
          key={editing?.id ?? 'new'}
          {...(editing ? { initial: { fullName: editing.fullName, ...(editing.socialName ? { socialName: editing.socialName } : {}), ...(editing.phone ? { phone: editing.phone } : {}), ...(editing.email ? { email: editing.email } : {}), status: editing.status, version: editing.version } } : {})}
          onSubmit={async (input) => {
            if (editing) await update(editing.id, input);
            else await create(input);
            setPanelOpen(false);
            setEditing(null);
          }}
        />
      </RightPanel>
    </section>
  );
}
