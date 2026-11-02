import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AppButton } from './AppButton';
import { colors, spacing, typography } from '../theme/tokens';
export function StateView({
  state,
  title,
  description,
  onRetry,
}: {
  state: 'loading' | 'empty' | 'error';
  title: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.container} accessibilityRole={state === 'error' ? 'alert' : 'summary'}>
      {state === 'loading' ? <ActivityIndicator size="large" color={colors.brand} /> : null}
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {state === 'error' && onRetry ? (
        <AppButton label="Tentar novamente" tone="secondary" onPress={onRetry} />
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  title: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    color: colors.muted,
    fontSize: typography.body,
    lineHeight: 23,
    textAlign: 'center',
  },
});
