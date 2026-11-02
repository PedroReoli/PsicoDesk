/* eslint-disable react-hooks/set-state-in-effect -- O efeito dispara uma consulta assíncrona; o estado é atualizado pelo ciclo da operação. */
import { useCallback, useEffect, useState } from 'react';
import { useAuthSession } from '../../auth/hooks/useAuthSession';
import { patientsService } from '../services/patients.service';
import type { Patient, PatientInput } from '../types/patient.types';

export function usePatients(query: string) {
  const { session } = useAuthSession();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try { setPatients(await patientsService.list(session.token, query)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao carregar pacientes.'); }
    finally { setLoading(false); }
  }, [session, query]);

  useEffect(() => { void load(); }, [load]);

  async function create(input: PatientInput) {
    if (!session) throw new Error('Sessão expirada.');
    const patient = await patientsService.create(session.token, input);
    setPatients((current) => [patient, ...current]);
    return patient;
  }

  return { patients, loading, error, reload: load, create };
}
