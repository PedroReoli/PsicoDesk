import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { AppButton } from '../../src/components/AppButton';
import { Screen } from '../../src/components/Screen';
import { SyncBadge } from '../../src/components/SyncBadge';
import { canAccess } from '../../src/security/permissions';
import { colors, spacing, typography } from '../../src/theme/tokens';
export default function MoreScreen() {
  const { session, logout } = useAuth();
  const role = session?.user.role;
  const links = [
    { label: 'Prontuário', route: '/(tabs)/prontuario', show: canAccess(role, 'clinical') },
    { label: 'Financeiro', route: '/(tabs)/financeiro', show: canAccess(role, 'finance') },
    { label: 'Documentos', route: '/(tabs)/documentos', show: canAccess(role, 'documents') },
    { label: 'Configurações', route: '/(tabs)/configuracoes', show: canAccess(role, 'settings') },
  ].filter((item) => item.show);
  return (
    <Screen
      title="Mais"
      {...(session ? { description: `${session.user.displayName} · ${session.user.role}` } : {})}
      action={<SyncBadge />}
    >
      <View style={styles.list}>
        {links.map((item) => (
          <AppButton
            key={item.route}
            label={item.label}
            tone="secondary"
            onPress={() => {
              router.push(item.route as never);
            }}
          />
        ))}
        <AppButton
          label="Sair e remover dados locais"
          tone="danger"
          onPress={() => {
            void logout();
          }}
        />
      </View>
      {links.length === 0 ? (
        <Text style={styles.empty}>Não há outras áreas disponíveis para este perfil.</Text>
      ) : null}
    </Screen>
  );
}
const styles = StyleSheet.create({
  list: { gap: spacing.md },
  empty: { color: colors.muted, fontSize: typography.body },
});
