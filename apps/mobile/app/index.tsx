import { Redirect } from 'expo-router';
import { StateView } from '../src/components/StateView';
import { useAuth } from '../src/auth/AuthProvider';
export default function Index() { const { session, loading } = useAuth(); if (loading) return <StateView state="loading" title="Abrindo PsicoDesk…" />; return <Redirect href={session ? '/(tabs)/dashboard' : '/login'} />; }
