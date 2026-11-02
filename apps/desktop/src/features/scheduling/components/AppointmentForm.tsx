import { useState, type SyntheticEvent } from 'react';
import { Button } from '../../../design-system/primitives/Button';
import { Input } from '../../../design-system/primitives/Input';
import { OptionPicker } from '../../../shared/components/OptionPicker';
import { useDirectoryOptions } from '../../../shared/hooks/useDirectoryOptions';
import type { AppointmentInput } from '../types/appointment.types';
import { hasValidPeriod, normalizeAppointmentInput } from '../types/appointment.types';
import styles from '../styles/scheduling.module.css';
export function AppointmentForm({
  onSubmit,
}: {
  onSubmit: (input: AppointmentInput) => Promise<void>;
}) {
  const patients = useDirectoryOptions('patients');
  const professionals = useDirectoryOptions('professionals');
  const [input, setInput] = useState<AppointmentInput>({
    patientId: '',
    professionalId: '',
    startsAt: '',
    endsAt: '',
    kind: 'individual',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasValidPeriod(input)) {
      setError('O término deve ocorrer depois do início.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(normalizeAppointmentInput(input));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível agendar.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className={styles.form} onSubmit={submit}>
      <OptionPicker
        label="Paciente"
        options={patients.options}
        value={input.patientId}
        onChange={(patientId) => {
          setInput({ ...input, patientId });
        }}
        loading={patients.loading}
        error={patients.error}
        required
      />
      <OptionPicker
        label="Profissional"
        options={professionals.options}
        value={input.professionalId}
        onChange={(professionalId) => {
          setInput({ ...input, professionalId });
        }}
        loading={professionals.loading}
        error={professionals.error}
        required
      />
      <Input
        label="Início"
        type="datetime-local"
        value={input.startsAt}
        onChange={(event) => {
          setInput({ ...input, startsAt: event.target.value });
        }}
        required
      />
      <Input
        label="Término"
        type="datetime-local"
        value={input.endsAt}
        onChange={(event) => {
          setInput({ ...input, endsAt: event.target.value });
        }}
        required
      />
      <Input
        label="Tipo de atendimento"
        value={input.kind}
        onChange={(event) => {
          setInput({ ...input, kind: event.target.value });
        }}
        required
      />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <Button type="submit" loading={saving} fullWidth>
        Salvar agendamento
      </Button>
    </form>
  );
}
