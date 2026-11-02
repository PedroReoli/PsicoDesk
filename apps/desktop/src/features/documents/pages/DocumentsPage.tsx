import { useState } from 'react';
import { PageHeader } from '../../../design-system/composites/PageHeader';
import { RightPanel } from '../../../design-system/composites/RightPanel';
import { EmptyState } from '../../../design-system/composites/EmptyState';
import { Button } from '../../../design-system/primitives/Button';
import { OptionPicker } from '../../../shared/components/OptionPicker';
import { useDirectoryOptions } from '../../../shared/hooks/useDirectoryOptions';
import { Badge } from '../../../design-system/primitives/Badge';
import { DocumentForm } from '../components/DocumentForm';
import { useDocuments } from '../hooks/useDocuments';
import styles from '../styles/documents.module.css';
const typeLabel = {
  declaration: 'Declaração',
  receipt: 'Recibo',
  report: 'Relatório',
  consent: 'Consentimento',
  other: 'Outro',
} as const;
export default function DocumentsPage() {
  const [patientId, setPatientId] = useState('');
  const [panel, setPanel] = useState(false);
  const [exported, setExported] = useState('');
  const [pendingExport, setPendingExport] = useState<string | null>(null);
  const patients = useDirectoryOptions('patients');
  const { documents, loading, error, reload, generate, exportDocument } = useDocuments(patientId);
  return (
    <section className={styles.page}>
      <PageHeader
        eyebrow="Arquivos protegidos"
        title="Documentos"
        description="Geração local, versões identificadas e integridade verificável."
        actions={
          <Button
            onClick={() => {
              setPanel(true);
            }}
          >
            Novo documento
          </Button>
        }
      />
      <div className={styles.filter}>
        <OptionPicker
          label="Filtrar por paciente"
          options={patients.options}
          value={patientId}
          onChange={setPatientId}
          loading={patients.loading}
          error={patients.error}
          emptyLabel="Todos os pacientes"
        />
      </div>
      {loading ? (
        <div className={styles.state}>Carregando documentos…</div>
      ) : error ? (
        <div className={styles.state}>
          <p role="alert">{error}</p>
          <Button onClick={() => void reload()}>Tentar novamente</Button>
        </div>
      ) : documents.length === 0 ? (
        <EmptyState
          title="Nenhum documento"
          description="Gere um documento para que ele apareça nesta área."
          action={
            <Button
              onClick={() => {
                setPanel(true);
              }}
            >
              Gerar documento
            </Button>
          }
        />
      ) : (
        <div className={styles.grid}>
          {documents.map((document) => (
            <article key={document.id} className={styles.document}>
              <div className={styles.icon} aria-hidden="true">
                ▤
              </div>
              <Badge>{typeLabel[document.documentType]}</Badge>
              <h2>{document.title}</h2>
              <p>
                Versão {document.templateVersion} ·{' '}
                {new Date(document.createdAt).toLocaleDateString('pt-BR')}
              </p>
              <small>Integridade {document.checksum.slice(0, 10)}…</small>
              {pendingExport === document.id ? (
                <div><p>Esta cópia .txt ficará legível fora do cofre, em Documentos/PsicoDesk/Documentos.</p><Button onClick={() => void exportDocument(document.id).then((path) => { setExported(path); setPendingExport(null); })}>Confirmar exportação legível</Button><Button variant="ghost" onClick={() => { setPendingExport(null); }}>Cancelar</Button></div>
              ) : <Button variant="ghost" onClick={() => { setPendingExport(document.id); }}>Exportar cópia legível fora do cofre</Button>}
            </article>
          ))}
        </div>
      )}
      {exported && <p role="status">Documento exportado para a pasta gerenciada: {exported}</p>}
      <RightPanel
        open={panel}
        title="Gerar documento"
        description="O arquivo será criado e protegido dentro da área privada do PsicoDesk."
        width="lg"
        onClose={() => {
          setPanel(false);
        }}
      >
        <DocumentForm
          onSubmit={async (input) => {
            await generate(input);
            setPanel(false);
          }}
        />
      </RightPanel>
    </section>
  );
}
