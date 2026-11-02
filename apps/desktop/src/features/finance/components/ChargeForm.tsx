import { useState, type SyntheticEvent } from 'react';
import { Button } from '../../../design-system/primitives/Button';
import { Input } from '../../../design-system/primitives/Input';
import { OptionPicker } from '../../../shared/components/OptionPicker';
import { useDirectoryOptions } from '../../../shared/hooks/useDirectoryOptions';
import { parseCurrencyToMinor, type ChargeInput } from '../types/finance.types';
import styles from '../styles/finance.module.css';
export function ChargeForm({ onSubmit }: { onSubmit: (input: ChargeInput) => Promise<void> }) {
  const patients = useDirectoryOptions('patients');
  const [patientId, setPatientId] = useState('');
  const [description, setDescription] = useState('Sessão individual');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountMinor = parseCurrencyToMinor(amount);
    if (amountMinor <= 0) {
      setError('Informe um valor maior que zero.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ patientId, description, amountMinor, dueDate });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao criar cobrança.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <form className={styles.form} onSubmit={submit}>
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
      <Input
        label="Descrição"
        value={description}
        onChange={(event) => {
          setDescription(event.target.value);
        }}
        required
      />
      <Input
        label="Valor"
        placeholder="R$ 0,00"
        value={amount}
        onChange={(event) => {
          setAmount(event.target.value);
        }}
        inputMode="decimal"
        required
      />
      <Input
        label="Vencimento"
        type="date"
        value={dueDate}
        onChange={(event) => {
          setDueDate(event.target.value);
        }}
        required
      />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <Button type="submit" loading={saving} fullWidth>
        Salvar cobrança
      </Button>
    </form>
  );
}
