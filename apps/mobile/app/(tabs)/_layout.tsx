import { Redirect, Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { canAccess } from '../../src/security/permissions';
import { colors } from '../../src/theme/tokens';
const icon =
  (symbol: string) =>
  ({ color }: { color: ColorValue }) => (
    <Text accessible={false} style={{ color, fontSize: 18 }}>
      {symbol}
    </Text>
  );
export default function TabsLayout() {
  const { session } = useAuth();
  if (!session) return <Redirect href="/login" />;
  const role = session.user.role;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Início',
          tabBarIcon: icon('⌂'),
          ...(canAccess(role, 'dashboard') ? {} : { href: null }),
        }}
      />
      <Tabs.Screen
        name="agenda"
        options={{
          title: 'Agenda',
          tabBarIcon: icon('□'),
          ...(canAccess(role, 'schedule') ? {} : { href: null }),
        }}
      />
      <Tabs.Screen
        name="pacientes"
        options={{
          title: 'Pacientes',
          tabBarIcon: icon('♙'),
          ...(canAccess(role, 'patients') ? {} : { href: null }),
        }}
      />
      <Tabs.Screen name="mais" options={{ title: 'Mais', tabBarIcon: icon('•••') }} />
      <Tabs.Screen name="prontuario" options={{ href: null }} />
      <Tabs.Screen name="financeiro" options={{ href: null }} />
      <Tabs.Screen name="documentos" options={{ href: null }} />
      <Tabs.Screen name="configuracoes" options={{ href: null }} />
    </Tabs>
  );
}
