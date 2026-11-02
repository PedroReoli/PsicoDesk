/* eslint-disable react-hooks/set-state-in-effect -- A consulta local é disparada quando a sessão muda. */
import { useEffect, useState } from 'react';
import { useAuthSession } from '../../features/auth/hooks/useAuthSession';
import { directoryService, type DirectoryOption } from '../services/directory.service';

export function useDirectoryOptions(kind: 'patients' | 'professionals') {
  const { session } = useAuthSession();
  const [options, setOptions] = useState<DirectoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let active = true;
    setLoading(true);
    setError(null);
    void directoryService[kind](session.token)
      .then((result) => {
        if (active) setOptions(result);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as opções.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [kind, session]);

  return { options, loading, error };
}
