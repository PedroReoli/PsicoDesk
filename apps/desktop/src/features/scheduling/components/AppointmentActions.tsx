import { useState } from 'react';
import { Button } from '../../../design-system/primitives/Button';
import { Input } from '../../../design-system/primitives/Input';
import type { Appointment, AppointmentStatus, AppointmentUpdateInput } from '../types/appointment.types';
import styles from '../styles/scheduling.module.css';

function localValue(value: string) { const date = new Date(value); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16); }

export function AppointmentActions({ appointment, onUpdate }: { appointment: Appointment; onUpdate: (input: AppointmentUpdateInput) => Promise<void> }) {
  const [status, setStatus] = useState<AppointmentStatus>(appointment.status);
  const [reason, setReason] = useState(appointment.cancellationReason ?? '');
  const [startsAt, setStartsAt] = useState(localValue(appointment.startsAt));
  const [endsAt, setEndsAt] = useState(localValue(appointment.endsAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true); setError('');
    try { await onUpdate({ status, ...(status === 'cancelled' ? { cancellationReason: reason } : {}), startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), version: appointment.version }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar.'); }
    finally { setBusy(false); }
  }
  return <div className={styles.actionsForm}>
    <p><strong>{appointment.patientName}</strong><br />{appointment.professionalName}</p>
    <fieldset className={styles.statusChoices}><legend>Status</legend>{(['scheduled','confirmed','completed','no_show','cancelled'] as AppointmentStatus[]).map((value) => <Button key={value} type="button" variant={status === value ? 'secondary' : 'ghost'} onClick={() => { setStatus(value); }}>{statusLabel[value]}</Button>)}</fieldset>
    {status === 'cancelled' && <Input label="Motivo do cancelamento" value={reason} onChange={(e) => { setReason(e.target.value); }} required />}
    <Input label="Novo início" type="datetime-local" value={startsAt} onChange={(e) => { setStartsAt(e.target.value); }} />
    <Input label="Novo fim" type="datetime-local" value={endsAt} onChange={(e) => { setEndsAt(e.target.value); }} />
    {error && <p role="alert">{error}</p>}<Button loading={busy} onClick={() => void save()}>Salvar atualização</Button>
  </div>;
}
const statusLabel: Record<AppointmentStatus,string> = { scheduled:'Agendado', confirmed:'Confirmado', completed:'Concluído', cancelled:'Cancelado', no_show:'Faltou' };
