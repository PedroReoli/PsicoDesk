import { StyleSheet, Text } from 'react-native';
import { Card } from '../../src/components/Card';
import { ResourceList } from '../../src/components/ResourceList';
import { RoleGate } from '../../src/components/RoleGate';
import { Screen } from '../../src/components/Screen';
import { useOfflineResource } from '../../src/data/useOfflineResource';
import { colors, typography } from '../../src/theme/tokens';
import type { ClinicalRecord } from '../../src/types/domain';
export default function ClinicalScreen() {
  const resource = useOfflineResource<ClinicalRecord>('clinical-records', '/v1/clinical-records');
  return (
    <RoleGate resource="clinical">
      <Screen
        title="Prontuário"
        description="Conteúdo restrito ao profissional autorizado."
        scroll={false}
      >
        <ResourceList
          {...resource}
          onRefresh={() => {
            void resource.reload();
          }}
          keyFor={(item) => item.id}
          emptyTitle="Nenhum registro clínico sincronizado"
          renderItem={(item) => (
            <Card>
              <Text style={styles.date}>{new Date(item.createdAt).toLocaleString('pt-BR')}</Text>
              <Text selectable style={styles.body}>
                {item.body}
              </Text>
              <Text style={styles.author}>
                por {item.authorName}
                {item.amendmentOf ? ' · adendo' : ''}
              </Text>
            </Card>
          )}
        />
      </Screen>
    </RoleGate>
  );
}
const styles = StyleSheet.create({
  date: { color: colors.brand, fontWeight: '700' },
  body: { color: colors.text, fontSize: typography.body, lineHeight: 24 },
  author: { color: colors.muted },
});
