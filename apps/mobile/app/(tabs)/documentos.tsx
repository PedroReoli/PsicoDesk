import { StyleSheet, Text } from 'react-native';
import { Card } from '../../src/components/Card';
import { ResourceList } from '../../src/components/ResourceList';
import { RoleGate } from '../../src/components/RoleGate';
import { Screen } from '../../src/components/Screen';
import { useOfflineResource } from '../../src/data/useOfflineResource';
import { colors, typography } from '../../src/theme/tokens';
import type { ClinicDocument } from '../../src/types/domain';
export default function DocumentsScreen() {
  const resource = useOfflineResource<ClinicDocument>('documents', '/v1/documents');
  return (
    <RoleGate resource="documents">
      <Screen
        title="Documentos"
        description="Metadados sincronizados; o conteúdo permanece protegido."
        scroll={false}
      >
        <ResourceList
          {...resource}
          onRefresh={() => {
            void resource.reload();
          }}
          keyFor={(item) => item.id}
          emptyTitle="Nenhum documento sincronizado"
          renderItem={(item) => (
            <Card>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.detail}>{item.documentType}</Text>
              <Text style={styles.detail}>
                {new Date(item.createdAt).toLocaleDateString('pt-BR')}
              </Text>
            </Card>
          )}
        />
      </Screen>
    </RoleGate>
  );
}
const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: typography.body, fontWeight: '800' },
  detail: { color: colors.muted },
});
