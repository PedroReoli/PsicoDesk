import { StyleSheet, Text } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { AppButton } from '../../src/components/AppButton';
import { Card } from '../../src/components/Card';
import { Screen } from '../../src/components/Screen';
import { SyncBadge } from '../../src/components/SyncBadge';
import { useSync } from '../../src/sync/SyncProvider';
import { colors, spacing } from '../../src/theme/tokens';
const short = (value: string | undefined) => value ? `${value.slice(0, 8)}…${value.slice(-4)}` : 'indisponível';
export default function SettingsScreen() { const { session, credentials, logout } = useAuth(); const { counts, syncing, syncNow } = useSync(); return <Screen title="Dispositivo pareado" description="Identificadores técnicos, sem conteúdo clínico." action={<SyncBadge />}><Card><Text style={styles.title}>{session?.deviceName}</Text><Text style={styles.detail}>Dispositivo: {short(session?.deviceId)}</Text><Text style={styles.detail}>Clínica: {short(session?.clinicId)}</Text><Text style={styles.detail}>Peer: {short(credentials?.peerDeviceId)}</Text><Text style={styles.detail}>Fingerprint confiável: {short(credentials?.trustedPeerFingerprint)}</Text></Card><Card><Text style={styles.detail}>{String(counts.pending)} envio(s) pendente(s) · {String(counts.received)} lote(s) recebido(s)</Text><AppButton label="Sincronizar agora" tone="secondary" loading={syncing} onPress={() => { void syncNow(); }} /></Card><AppButton label="Desprovisionar e apagar dados locais" tone="danger" onPress={() => { void logout(); }} /></Screen>; }
const styles = StyleSheet.create({ title: { color: colors.text, fontWeight: '800' }, detail: { color: colors.muted, lineHeight: 21, marginBottom: spacing.xs } });
