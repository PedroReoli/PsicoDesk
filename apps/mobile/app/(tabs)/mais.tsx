import { router } from 'expo-router';
import { View } from 'react-native';
import { AppButton } from '../../src/components/AppButton';
import { Screen } from '../../src/components/Screen';
import { SyncBadge } from '../../src/components/SyncBadge';
import { spacing } from '../../src/theme/tokens';
const links = [
  { label: 'Prontuário', route: '/(tabs)/prontuario' },
  { label: 'Financeiro', route: '/(tabs)/financeiro' },
  { label: 'Documentos', route: '/(tabs)/documentos' },
  { label: 'Configurações', route: '/(tabs)/configuracoes' },
];
export default function MoreScreen() {
  return (
    <Screen
      title="Mais"
      description="Áreas offline sem exposição de dados sensíveis."
      action={<SyncBadge />}
    >
      <View style={{ gap: spacing.md }}>
        {links.map((item) => (
          <AppButton
            key={item.route}
            label={item.label}
            tone="secondary"
            onPress={() => router.push(item.route as never)}
          />
        ))}
      </View>
    </Screen>
  );
}
