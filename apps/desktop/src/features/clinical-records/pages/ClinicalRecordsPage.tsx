import { useState } from 'react';
import { PageHeader } from '../../../design-system/composites/PageHeader';
import { RightPanel } from '../../../design-system/composites/RightPanel';
import { EmptyState } from '../../../design-system/composites/EmptyState';
import { Button } from '../../../design-system/primitives/Button';
import { Badge } from '../../../design-system/primitives/Badge';
import { OptionPicker } from '../../../shared/components/OptionPicker';
import { useDirectoryOptions } from '../../../shared/hooks/useDirectoryOptions';
import { ClinicalRecordForm } from '../components/ClinicalRecordForm';
import { useClinicalRecords } from '../hooks/useClinicalRecords';
import styles from '../styles/clinical-records.module.css';
export default function ClinicalRecordsPage() {
  const patients = useDirectoryOptions('patients');
  const [patientId, setPatientId] = useState('');
  const [panel, setPanel] = useState<'new' | 'amend' | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const { records, loading, error, reload, create, amend } = useClinicalRecords(patientId);
  return (
    <section className={styles.page}>
      <PageHeader
        eyebrow="Acesso restrito"
        title="Prontuário"
        description="Registros clínicos imutáveis, com autoria, integridade e adendos rastreáveis."
        actions={
          <Button
            disabled={!patientId}
            onClick={() => {
              setPanel('new');
            }}
          >
            Nova evolução
          </Button>
        }
      />
      <div className={styles.patientSearch}>
        <OptionPicker
          label="Paciente"
          options={patients.options}
          value={patientId}
          onChange={(value) => {
            setPatientId(value);
          }}
          loading={patients.loading}
          error={patients.error}
          required
        />
      </div>
      {!patientId ? (
        <EmptyState
          title="Selecione um paciente"
          description="O conteúdo clínico só é carregado após autorização do backend local."
        />
      ) : loading ? (
        <div className={styles.state}>Carregando prontuário…</div>
      ) : error ? (
        <div className={styles.state}>
          <p role="alert">{error}</p>
          <Button onClick={() => void reload()}>Tentar novamente</Button>
        </div>
      ) : records.length === 0 ? (
        <EmptyState
          title="Prontuário sem registros"
          description="Nenhuma evolução foi assinada para este paciente."
          action={
            <Button
              onClick={() => {
                setPanel('new');
              }}
            >
              Criar evolução
            </Button>
          }
        />
      ) : (
        <div className={styles.timeline}>
          {records.map((record) => (
            <article key={record.id} className={styles.record}>
              <div className={styles.meta}>
                <div>
                  <time dateTime={record.createdAt}>
                    {new Date(record.createdAt).toLocaleString('pt-BR')}
                  </time>
                  <p>por {record.authorName}</p>
                </div>
                {record.amendmentOf && <Badge tone="warning">Adendo</Badge>}
              </div>
              <p className={styles.body}>{record.body}</p>
              <footer>
                <span>Integridade: {record.contentHash.slice(0, 12)}…</span>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSelected(record.id);
                    setPanel('amend');
                  }}
                >
                  Adicionar adendo
                </Button>
              </footer>
            </article>
          ))}
        </div>
      )}
      <RightPanel
        open={panel === 'new'}
        title="Nova evolução"
        description="O salvamento cria um registro permanente e auditável."
        width="lg"
        onClose={() => {
          setPanel(null);
        }}
      >
        <ClinicalRecordForm
          onSubmit={async (body) => {
            await create({ patientId, body });
            setPanel(null);
          }}
        />
      </RightPanel>
      <RightPanel
        open={panel === 'amend'}
        title="Adicionar adendo"
        description="O registro original será preservado integralmente."
        width="lg"
        onClose={() => {
          setPanel(null);
        }}
      >
        <ClinicalRecordForm
          submitLabel="Assinar adendo"
          onSubmit={async (body) => {
            if (!selected) return;
            await amend(selected, body);
            setPanel(null);
          }}
        />
      </RightPanel>
    </section>
  );
}
