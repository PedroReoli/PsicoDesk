import { StyleSheet, Text } from 'react-native';
import { Card } from '../../src/components/Card';
import { ResourceList } from '../../src/components/ResourceList';
import { RoleGate } from '../../src/components/RoleGate';
import { Screen } from '../../src/components/Screen';
import { useOfflineResource } from '../../src/data/useOfflineResource';
import { colors, typography } from '../../src/theme/tokens';
import type { Charge } from '../../src/types/domain';
const money = (minor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(minor / 100);
export default function FinanceScreen() { const resource = useOfflineResource<Charge>('charges', '/v1/charges'); return <RoleGate resource="finance"><Screen title="Financeiro" description="Valores disponíveis para o seu perfil." scroll={false}><ResourceList {...resource} onRefresh={() => { void resource.reload(); }} keyFor={(item) => item.id} emptyTitle="Nenhum lançamento sincronizado" renderItem={(item) => <Card><Text style={styles.patient}>{item.patientName}</Text><Text style={styles.description}>{item.description}</Text><Text style={styles.amount}>{money(item.amountMinor)}</Text><Text style={styles.status}>{item.status} · vence {new Date(`${item.dueDate}T12:00:00`).toLocaleDateString('pt-BR')}</Text></Card>} /></Screen></RoleGate>; }
const styles = StyleSheet.create({ patient: { color: colors.text, fontSize: typography.body, fontWeight: '800' }, description: { color: colors.muted }, amount: { color: colors.text, fontSize: typography.heading, fontWeight: '800' }, status: { color: colors.brand } });
