import { Redirect, router } from 'expo-router';
import { useState, type SyntheticEvent } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth/AuthProvider';
import { AppButton } from '../src/components/AppButton';
import { colors, radius, spacing, typography } from '../src/theme/tokens';
export default function Login() {
  const { session, loading, error, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  if (session) return <Redirect href="/(tabs)/dashboard" />;
  async function submit(_event?: SyntheticEvent) {
    try {
      await login(username.trim(), password);
      router.replace('/(tabs)/dashboard');
    } catch {
      /* A mensagem segura é apresentada pelo provider. */
    }
  }
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.page}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.brand}>
          <Text style={styles.mark}>Ψ</Text>
          <Text style={styles.name}>PsicoDesk</Text>
          <Text style={styles.tagline}>Sua clínica conectada com segurança.</Text>
        </View>
        <View style={styles.form}>
          <TextInput
            accessibilityLabel="Usuário"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            placeholder="Usuário"
            placeholderTextColor={colors.muted}
            value={username}
            onChangeText={setUsername}
            style={styles.input}
            returnKeyType="next"
          />
          <TextInput
            accessibilityLabel="Senha"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            placeholder="Senha"
            placeholderTextColor={colors.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
            returnKeyType="done"
            onSubmitEditing={() => {
              void submit();
            }}
          />
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <AppButton
            label="Entrar"
            loading={loading}
            disabled={!username.trim() || password.length < 1}
            onPress={() => {
              void submit();
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.xxl },
  brand: { alignItems: 'center', gap: spacing.sm },
  mark: {
    width: 64,
    height: 64,
    textAlign: 'center',
    textAlignVertical: 'center',
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.brand,
    color: colors.surface,
    fontSize: 40,
  },
  name: { color: colors.text, fontSize: 34, fontWeight: '800' },
  tagline: { color: colors.muted, fontSize: typography.body },
  form: { gap: spacing.md },
  input: {
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: typography.body,
  },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    padding: spacing.md,
    borderRadius: radius.md,
  },
});
