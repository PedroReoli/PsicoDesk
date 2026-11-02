import { useCallback, useEffect, useState } from 'react';
import { listProjection, type ProjectionRecord } from '../database/projectionRepository';
import { useSync } from '../sync/SyncProvider';
import type { ProjectionEntity } from '../types/sync';
export function useProjection(entity: ProjectionEntity) {
  const { projectionVersion, syncNow } = useSync();
  const [data, setData] = useState<ProjectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await listProjection(entity));
    } catch {
      setError('Não foi possível abrir a projeção local protegida.');
    } finally {
      setLoading(false);
    }
  }, [entity]);
  useEffect(() => {
    void load();
  }, [load, projectionVersion]);
  const refresh = useCallback(async () => {
    await syncNow();
    await load();
  }, [syncNow, load]);
  return { data, loading, error, refresh };
}
