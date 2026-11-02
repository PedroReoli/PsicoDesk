import { StyleSheet, Text } from 'react-native';
import { Card } from '../../src/components/Card';
import { ResourceList } from '../../src/components/ResourceList';
import { RoleGate } from '../../src/components/RoleGate';
import { Screen } from '../../src/components/Screen';
import { useOfflineResource } from '../../src/data/useOfflineResource';
import { colors, typography } from '../../src/theme/tokens';
import type { Patient } from '../../src/types/domain';
export default function PatientsScreen() {
  const resource = useOfflineResource<Patient>('patients', '/v1/patients');
  return (
    <RoleGate resource="patients">
      <Screen title="Pacientes" description="Cadastros disponíveis offline." scroll={false}>
        <ResourceList
          {...resource}
          onRefresh={() => {
            void resource.reload();
          }}
          keyFor={(item) => item.id}
          emptyTitle="Nenhum paciente sincronizado"
          renderItem={(item) => (
            <Card>
              <Text style={styles.name}>{item.socialName ?? item.fullName}</Text>
              {item.socialName ? <Text style={styles.detail}>{item.fullName}</Text> : null}
              <Text style={styles.detail}>{item.phone ?? 'Sem telefone cadastrado'}</Text>
              <Text style={styles.status}>{item.status}</Text>
            </Card>
          )}
        />
      </Screen>
    </RoleGate>
  );
}
const styles = StyleSheet.create({
  name: { color: colors.text, fontSize: typography.body, fontWeight: '800' },
  detail: { color: colors.muted },
  status: { color: colors.brand, fontWeight: '700' },
});
