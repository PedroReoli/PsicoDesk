import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { readCache, replaceCache } from '../database/cacheRepository';
import { useSync } from '../sync/SyncProvider';
import type { Dashboard } from '../types/domain';
interface CachedDashboard extends Dashboard { id: string; updatedAt: string; }
export function useDashboard() { const { session } = useAuth(); const { online } = useSync(); const [data, setData] = useState<Dashboard | null>(null); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState<string | null>(null); const load = useCallback(async (refresh = false) => { if (!session) return; refresh ? setRefreshing(true) : setLoading(true); setError(null); try { const [cached] = await readCache<CachedDashboard>('dashboard'); if (cached) setData(cached); if (online) { const remote = await apiRequest<Dashboard>('/v1/dashboard', { token: session.accessToken }); await replaceCache('dashboard', [{ ...remote, id: 'dashboard', updatedAt: new Date().toISOString() }]); setData(remote); } } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao atualizar o dashboard.'); } finally { setLoading(false); setRefreshing(false); } }, [online, session]); useEffect(() => { void load(); }, [load]); return { data, loading, refreshing, error, reload: () => load(true) }; }
