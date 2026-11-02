/* eslint-disable react-hooks/set-state-in-effect -- O efeito dispara uma consulta assíncrona; o estado é atualizado pelo ciclo da operação. */
import { useCallback, useEffect, useState } from 'react';
import { useAuthSession } from '../../auth/hooks/useAuthSession';
import { dashboardService } from '../services/dashboard.service';
import type { DashboardReport } from '../types/dashboard.types';
export function useDashboard() {
  const { session } = useAuthSession();
  const [data, setData] = useState<DashboardReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      setData(await dashboardService.getReport(session.token));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar o resumo.');
    } finally {
      setLoading(false);
    }
  }, [session]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, loading, error, reload: load };
}
