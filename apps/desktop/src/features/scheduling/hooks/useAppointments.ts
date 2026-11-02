/* eslint-disable react-hooks/set-state-in-effect -- O efeito dispara uma consulta assíncrona; o estado é atualizado pelo ciclo da operação. */
import { useCallback, useEffect, useState } from 'react';
import { useAuthSession } from '../../auth/hooks/useAuthSession';
import { schedulingService } from '../services/scheduling.service';
import type { Appointment, AppointmentInput, AppointmentUpdateInput } from '../types/appointment.types';
function weekRange(reference: Date) {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { from: start.toISOString(), to: end.toISOString() };
}
export function useAppointments(reference: Date) {
  const { session } = useAuthSession();
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    const range = weekRange(reference);
    try {
      setItems(await schedulingService.list(session.token, range.from, range.to));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar a agenda.');
    } finally {
      setLoading(false);
    }
  }, [session, reference]);
  useEffect(() => {
    void load();
  }, [load]);
  async function create(input: AppointmentInput) {
    if (!session) throw new Error('Sessão expirada.');
    const item = await schedulingService.create(session.token, input);
    setItems((current) => [...current, item].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
  }
  async function update(appointmentId: string, input: AppointmentUpdateInput) {
    if (!session) throw new Error('Sessão expirada.');
    const item = await schedulingService.updateStatus(session.token, appointmentId, input);
    setItems((current) => current.map((entry) => entry.id === item.id ? item : entry).sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
  }
  return { items, loading, error, reload: load, create, update };
}
