import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '../theme/tokens';
export function Screen({ title, description, action, children, scroll = true }: PropsWithChildren<{ title: string; description?: string; action?: ReactNode; scroll?: boolean }>) {
  const content = <View style={styles.content}><View style={styles.header}><View style={styles.heading}><Text accessibilityRole="header" style={styles.title}>{title}</Text>{description ? <Text style={styles.description}>{description}</Text> : null}</View>{action}</View>{children}</View>;
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>{scroll ? <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">{content}</ScrollView> : content}</SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, scroll: { flexGrow: 1 }, content: { flex: 1, padding: spacing.lg, gap: spacing.lg }, header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md }, heading: { flex: 1, gap: spacing.xs }, title: { color: colors.text, fontSize: typography.title, fontWeight: '800', letterSpacing: -0.6 }, description: { color: colors.muted, fontSize: typography.label, lineHeight: 20 } });
