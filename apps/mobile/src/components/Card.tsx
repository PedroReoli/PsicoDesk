import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../theme/tokens';
export function Card({ children }: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}
const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
  },
});
