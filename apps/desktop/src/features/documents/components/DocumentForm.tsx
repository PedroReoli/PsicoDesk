import { useState, type SyntheticEvent } from 'react';
import { Button } from '../../../design-system/primitives/Button';
import { Input } from '../../../design-system/primitives/Input';
import type { DocumentType, GenerateDocumentInput } from '../types/document.types';
import styles from '../styles/documents.module.css';
export function DocumentForm({
  onSubmit,
}: {
  onSubmit: (input: GenerateDocumentInput) => Promise<void>;
}) {
  const [patientId, setPatientId] = useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<DocumentType>('declaration');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (content.trim().length < 10) {
      setError('Escreva o conteúdo do documento.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        patientId: patientId.length ? patientId : undefined,
        title,
        documentType: type,
        content,
        templateVersion: 1,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao gerar documento.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className={styles.form} onSubmit={submit}>
      <Input
        label="ID do paciente (opcional)"
        value={patientId}
        onChange={(event) => {
          setPatientId(event.target.value);
        }}
      />
      <Input
        label="Título"
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
        }}
        required
      />
      <label>
        Tipo
        <select
          value={type}
          onChange={(event) => {
            setType(event.target.value as DocumentType);
          }}
        >
          <option value="declaration">Declaração</option>
          <option value="receipt">Recibo</option>
          <option value="report">Relatório</option>
          <option value="consent">Consentimento</option>
          <option value="other">Outro</option>
        </select>
      </label>
      <label>
        Conteúdo
        <textarea
          rows={14}
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
          }}
          required
        />
      </label>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <Button type="submit" loading={saving} fullWidth>
        Gerar documento protegido
      </Button>
    </form>
  );
}
