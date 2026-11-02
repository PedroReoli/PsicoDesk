import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { AppButton } from '../../src/components/AppButton';
import { RoleGate } from '../../src/components/RoleGate';
import { Screen } from '../../src/components/Screen';
import { SyncBadge } from '../../src/components/SyncBadge';
import { useSync } from '../../src/sync/SyncProvider';
import { colors, spacing, typography } from '../../src/theme/tokens';
export default function SettingsScreen() {
  const { session, logout } = useAuth();
  const { pending, failed, lastSyncAt, syncNow, syncing } = useSync();
  return (
    <RoleGate resource="settings">
      <Screen title="Configurações" description="Sessão e sincronização deste dispositivo.">
        <SyncBadge />
        <View style={styles.section}>
          <Text style={styles.heading}>Conta</Text>
          <Text style={styles.value}>{session?.user.displayName}</Text>
          <Text style={styles.detail}>Perfil: {session?.user.role}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.heading}>Sincronização</Text>
          <Text style={styles.detail}>{String(pending)} alteração(ões) pendente(s)</Text>
          {failed ? (
            <Text accessibilityRole="alert" style={styles.failure}>
              {String(failed)} alteração(ões) foi(ram) rejeitada(s). Atualize os dados antes de
              tentar novamente.
            </Text>
          ) : null}
          <Text style={styles.detail}>
            {lastSyncAt
              ? `Última tentativa: ${new Date(lastSyncAt).toLocaleString('pt-BR')}`
              : 'Ainda não sincronizado nesta sessão'}
          </Text>
          <AppButton
            label="Sincronizar agora"
            tone="secondary"
            loading={syncing}
            onPress={() => {
              void syncNow();
            }}
          />
        </View>
        <AppButton
          label="Sair e remover dados locais"
          tone="danger"
          onPress={() => {
            void logout();
          }}
        />
      </Screen>
    </RoleGate>
  );
}
const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  heading: { color: colors.text, fontSize: typography.heading, fontWeight: '800' },
  value: { color: colors.text, fontSize: typography.body, fontWeight: '700' },
  detail: { color: colors.muted, lineHeight: 21 },
  failure: { color: colors.danger, lineHeight: 21 },
});
