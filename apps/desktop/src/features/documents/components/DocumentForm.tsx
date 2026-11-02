import { useState, type SyntheticEvent } from 'react';
import { Button } from '../../../design-system/primitives/Button';
import { Input } from '../../../design-system/primitives/Input';
import { OptionPicker } from '../../../shared/components/OptionPicker';
import { useDirectoryOptions } from '../../../shared/hooks/useDirectoryOptions';
import type { DocumentType, GenerateDocumentInput } from '../types/document.types';
import styles from '../styles/documents.module.css';
export function DocumentForm({
  onSubmit,
}: {
  onSubmit: (input: GenerateDocumentInput) => Promise<void>;
}) {
  const patients = useDirectoryOptions('patients');
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
      <OptionPicker
        label="Paciente (opcional)"
        options={patients.options}
        value={patientId}
        onChange={(value) => {
          setPatientId(value);
        }}
        loading={patients.loading}
        error={patients.error}
        emptyLabel="Documento geral, sem paciente"
      />
      <Input
        label="Título"
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
        }}
        required
      />
      <fieldset className={styles.choiceGroup}>
        <legend>Tipo</legend>
        <div role="radiogroup" aria-label="Tipo de documento">
          {(
            [
              ['declaration', 'Declaração'],
              ['receipt', 'Recibo'],
              ['report', 'Relatório'],
              ['consent', 'Consentimento'],
              ['other', 'Outro'],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              variant={type === value ? 'primary' : 'ghost'}
              role="radio"
              aria-checked={type === value}
              onClick={() => {
                setType(value);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </fieldset>
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
