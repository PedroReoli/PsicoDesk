import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth/AuthProvider';
import { AppButton } from '../src/components/AppButton';
import { colors, radius, spacing, typography } from '../src/theme/tokens';
import type { MobileRole } from '../src/types/sync';

const initialServer = process.env.EXPO_PUBLIC_API_URL ?? '';
export default function ProvisioningScreen() {
  const { session, loading, error, provision } = useAuth();
  const [serverUrl, setServerUrl] = useState(initialServer);
  const [clinicId, setClinicId] = useState('');
  const [enrollmentToken, setEnrollmentToken] = useState('');
  const [deviceName, setDeviceName] = useState('Meu celular');
  const [role, setRole] = useState<MobileRole>('psychologist');
  const [syncKeyHex, setSyncKeyHex] = useState('');
  const [syncKeyId, setSyncKeyId] = useState('clinic-v1');
  const [peerDeviceId, setPeerDeviceId] = useState('');
  const [trustedPeerPublicKey, setTrustedPeerPublicKey] = useState('');
  const [trustedPeerFingerprint, setTrustedPeerFingerprint] = useState('');
  if (session) return <Redirect href="/(tabs)/dashboard" />;
  const submit = async () => {
    try {
      await provision({
        serverUrl: serverUrl.trim(),
        clinicId: clinicId.trim(),
        enrollmentToken: enrollmentToken.trim(),
        deviceName: deviceName.trim(),
        role,
        syncKeyHex: syncKeyHex.trim(),
        syncKeyId: syncKeyId.trim(),
        peerDeviceId: peerDeviceId.trim(),
        trustedPeerPublicKey: trustedPeerPublicKey.trim(),
        trustedPeerFingerprint: trustedPeerFingerprint.trim(),
      });
      router.replace('/(tabs)/dashboard');
    } catch {
      /* Erro seguro exposto pelo provider. */
    }
  };
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Text accessibilityRole="header" style={styles.name}>
              Provisionar PsicoDesk
            </Text>
            <Text style={styles.tagline}>
              Importe os dados do bundle entregue por canal separado. A chave clínica nunca é
              enviada ao servidor.
            </Text>
          </View>
          <View style={styles.form}>
            <Field
              label="Servidor HTTPS"
              value={serverUrl}
              onChangeText={setServerUrl}
              autoCapitalize="none"
              keyboardType="url"
            />
            <Field
              label="ID da clínica"
              value={clinicId}
              onChangeText={setClinicId}
              autoCapitalize="none"
            />
            <Field
              label="Token de provisionamento"
              value={enrollmentToken}
              onChangeText={setEnrollmentToken}
              autoCapitalize="none"
              secureTextEntry
            />
            <Field label="Nome deste dispositivo" value={deviceName} onChangeText={setDeviceName} />
            <Field
              label="Papel do bundle"
              value={role}
              onChangeText={(value) => setRole(value as MobileRole)}
              autoCapitalize="none"
              accessibilityHint="owner, admin, psychologist, receptionist ou finance"
            />
            <Field
              label="ID do desktop pareado"
              value={peerDeviceId}
              onChangeText={setPeerDeviceId}
              autoCapitalize="none"
            />
            <Field
              label="Chave pública do desktop"
              value={trustedPeerPublicKey}
              onChangeText={setTrustedPeerPublicKey}
              autoCapitalize="none"
              secureTextEntry
            />
            <Field
              label="Fingerprint do desktop"
              value={trustedPeerFingerprint}
              onChangeText={setTrustedPeerFingerprint}
              autoCapitalize="none"
            />
            <Field
              label="ID da chave clínica"
              value={syncKeyId}
              onChangeText={setSyncKeyId}
              autoCapitalize="none"
            />
            <Field
              label="Chave clínica (64 caracteres hex)"
              value={syncKeyHex}
              onChangeText={setSyncKeyHex}
              autoCapitalize="none"
              secureTextEntry
            />
            {error ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            ) : null}
            <AppButton
              label="Validar e provisionar"
              loading={loading}
              disabled={
                !serverUrl ||
                !clinicId ||
                !enrollmentToken ||
                !syncKeyHex ||
                !peerDeviceId ||
                !trustedPeerPublicKey ||
                !trustedPeerFingerprint
              }
              onPress={() => {
                void submit();
              }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCorrect={false}
        placeholderTextColor={colors.muted}
        style={styles.input}
        {...props}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.xl },
  brand: { gap: spacing.sm },
  name: { color: colors.text, fontSize: 30, fontWeight: '800' },
  tagline: { color: colors.muted, fontSize: typography.body, lineHeight: 23 },
  form: { gap: spacing.md },
  field: { gap: spacing.xs },
  label: { color: colors.text, fontWeight: '700' },
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
