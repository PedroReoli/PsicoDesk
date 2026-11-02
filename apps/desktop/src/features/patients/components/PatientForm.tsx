import { useState, type SyntheticEvent } from 'react';
import { Button } from '../../../design-system/primitives/Button';
import { Input } from '../../../design-system/primitives/Input';
import type { PatientInput } from '../types/patient.types';
import { validatePatient } from '../types/patient.types';
import styles from '../styles/patients.module.css';

export function PatientForm({ onSubmit }: { onSubmit: (input: PatientInput) => Promise<void> }) {
  const [input, setInput] = useState<PatientInput>({ fullName: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof PatientInput, string>>>({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const update = (field: keyof PatientInput, value: string) => { setInput((current) => ({ ...current, [field]: value })); };

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validatePatient(input);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true); setSubmitError(null);
    try { await onSubmit(input); setInput({ fullName: '' }); }
    catch (cause) { setSubmitError(cause instanceof Error ? cause.message : 'Não foi possível salvar o paciente.'); }
    finally { setSaving(false); }
  }

  return <form className={styles.form} onSubmit={submit} noValidate>
    <Input label="Nome completo" value={input.fullName} onChange={(event) => { update('fullName', event.target.value); }} error={errors.fullName} required autoFocus />
    <Input label="Nome social" value={input.socialName ?? ''} onChange={(event) => { update('socialName', event.target.value); }} />
    <Input label="Telefone" value={input.phone ?? ''} onChange={(event) => { update('phone', event.target.value); }} inputMode="tel" />
    <Input label="E-mail" type="email" value={input.email ?? ''} onChange={(event) => { update('email', event.target.value); }} error={errors.email} />
    {submitError && <p className={styles.error} role="alert">{submitError}</p>}
    <Button type="submit" loading={saving} fullWidth>Salvar paciente</Button>
  </form>;
}
