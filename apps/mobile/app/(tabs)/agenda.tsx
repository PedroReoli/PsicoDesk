import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthProvider';
import { AppButton } from '../../src/components/AppButton';
import { Card } from '../../src/components/Card';
import { ResourceList } from '../../src/components/ResourceList';
import { RoleGate } from '../../src/components/RoleGate';
import { Screen } from '../../src/components/Screen';
import { useOfflineResource } from '../../src/data/useOfflineResource';
import { mutateOfflineFirst } from '../../src/sync/mutateOfflineFirst';
import { colors, spacing, typography } from '../../src/theme/tokens';
import type { Appointment } from '../../src/types/domain';
export default function AgendaScreen() {
  const { session } = useAuth();
  const resource = useOfflineResource<Appointment>('appointments', '/v1/appointments');
  async function confirm(item: Appointment) {
    if (!session) return;
    await mutateOfflineFirst(
      session.accessToken,
      'appointments',
      'PATCH',
      `/v1/appointments/${item.id}/status`,
      { status: 'confirmed', version: item.updatedAt },
    );
    await resource.reload();
  }
  return (
    <RoleGate resource="schedule">
      <Screen
        title="Agenda"
        description="Atendimentos disponíveis neste dispositivo."
        scroll={false}
      >
        <ResourceList
          {...resource}
          onRefresh={() => {
            void resource.reload();
          }}
          keyFor={(item) => item.id}
          emptyTitle="Nenhum atendimento sincronizado"
          renderItem={(item) => (
            <Card>
              <View style={styles.row}>
                <View style={styles.time}>
                  <Text style={styles.hour}>
                    {new Date(item.startsAt).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                  <Text style={styles.date}>
                    {new Date(item.startsAt).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </Text>
                </View>
                <View style={styles.details}>
                  <Text style={styles.name}>{item.patientName}</Text>
                  <Text style={styles.status}>{item.status}</Text>
                </View>
              </View>
              {item.status === 'scheduled' ? (
                <AppButton
                  label="Confirmar atendimento"
                  tone="secondary"
                  onPress={() => {
                    void confirm(item);
                  }}
                />
              ) : null}
            </Card>
          )}
        />
      </Screen>
    </RoleGate>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.lg },
  time: { minWidth: 72 },
  details: { flex: 1 },
  hour: { color: colors.brand, fontSize: typography.heading, fontWeight: '800' },
  date: { color: colors.muted },
  name: { color: colors.text, fontSize: typography.body, fontWeight: '700' },
  status: { color: colors.muted, marginTop: spacing.xs },
});
