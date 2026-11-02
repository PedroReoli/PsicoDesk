import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSync } from '../sync/SyncProvider';
import { colors, radius, spacing, typography } from '../theme/tokens';
export function SyncBadge() {
  const { online, connected, syncing, pending, failed, syncNow } = useSync();
  const disabled = !online || syncing;
  const label = failed
    ? `${String(failed)} alteração(ões) requer(em) atenção`
    : !online
      ? `Offline${pending ? ` · ${String(pending)} pendente(s)` : ''}`
      : syncing
        ? 'Sincronizando…'
        : connected
          ? 'Sincronizado'
          : 'Online';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={disabled ? label : `${label}. Toque para sincronizar.`}
      accessibilityState={{ disabled, busy: syncing }}
      disabled={disabled}
      onPress={() => {
        void syncNow();
      }}
      style={styles.badge}
    >
      <View
        style={[
          styles.dot,
          {
            backgroundColor: failed
              ? colors.danger
              : !online
                ? colors.warning
                : connected
                  ? colors.success
                  : colors.info,
          },
        ]}
      />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { color: colors.text, fontSize: typography.caption, fontWeight: '700' },
});
