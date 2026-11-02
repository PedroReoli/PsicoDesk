import { StyleSheet, Text } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { useProjection } from '../data/useProjection';
import type { ProjectionRecord } from '../database/projectionRepository';
import { canAccess, resourceForEntity } from '../security/permissions';
import { colors, spacing, typography } from '../theme/tokens';
import type { ProjectionEntity } from '../types/sync';
import { Card } from './Card';
import { ResourceList } from './ResourceList';
import { Screen } from './Screen';
import { StateView } from './StateView';
import { SyncBadge } from './SyncBadge';
function text(payload: Record<string, unknown>, key: string, fallback: string) {
  return typeof payload[key] === 'string' && payload[key] ? String(payload[key]) : fallback;
}
function money(value: unknown) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    typeof value === 'number' ? value / 100 : 0,
  );
}
function lines(item: ProjectionRecord): [string, string, string?] {
  const p = item.payload;
  switch (item.entityType) {
    case 'patient':
      return [
        text(p, 'socialName', text(p, 'fullName', 'Paciente sem nome')),
        `Status: ${text(p, 'status', 'não informado')}`,
      ];
    case 'appointment':
      return [
        new Date(text(p, 'startsAt', item.updatedAt)).toLocaleString('pt-BR'),
        `${text(p, 'kind', 'Sessão')} · ${text(p, 'status', 'sem status')}`,
      ];
    case 'clinicalRecord':
      return [
        'Registro clínico protegido',
        new Date(text(p, 'createdAt', item.updatedAt)).toLocaleString('pt-BR'),
        'O conteúdo permanece cifrado no prontuário.',
      ];
    case 'charge':
      return [
        text(p, 'description', 'Cobrança'),
        `${money(p.amountMinor)} · ${text(p, 'status', 'sem status')}`,
      ];
    case 'payment':
      return [
        'Pagamento',
        `${money(p.amountMinor)} · ${text(p, 'method', 'método não informado')}`,
      ];
    case 'document':
      return [
        text(p, 'title', 'Documento'),
        `${text(p, 'documentType', 'tipo não informado')} · ${new Date(text(p, 'createdAt', item.updatedAt)).toLocaleDateString('pt-BR')}`,
      ];
  }
}
export function ProjectionScreen({
  entity,
  title,
  description,
  emptyTitle,
}: {
  entity: ProjectionEntity;
  title: string;
  description: string;
  emptyTitle: string;
}) {
  const { credentials } = useAuth();
  const { data, loading, error, refresh } = useProjection(entity);
  if (!credentials || !canAccess(credentials.role, resourceForEntity(entity)))
    return (
      <Screen title={title}>
        <StateView
          state="error"
          title="Acesso restrito"
          description="O papel provisionado neste dispositivo não permite abrir esta área."
        />
      </Screen>
    );
  return (
    <Screen title={title} description={description} action={<SyncBadge />} scroll={false}>
      <ResourceList
        data={data}
        loading={loading}
        refreshing={false}
        error={error}
        onRefresh={() => {
          void refresh();
        }}
        keyFor={(item) => item.entityId}
        emptyTitle={emptyTitle}
        renderItem={(item) => {
          const [heading, detail, note] = lines(item);
          return (
            <Card>
              <Text style={styles.heading}>{heading}</Text>
              <Text style={styles.detail}>{detail}</Text>
              {note ? <Text style={styles.note}>{note}</Text> : null}
            </Card>
          );
        }}
      />
    </Screen>
  );
}
const styles = StyleSheet.create({
  heading: { color: colors.text, fontSize: typography.body, fontWeight: '700' },
  detail: { color: colors.muted },
  note: { color: colors.muted, fontSize: typography.caption, marginTop: spacing.xs },
});
