import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../src/auth/AuthProvider';
import { SyncProvider } from '../src/sync/SyncProvider';
import { colors } from '../src/theme/tokens';
export default function RootLayout() { return <SafeAreaProvider><AuthProvider><SyncProvider><StatusBar style="dark" backgroundColor={colors.background} /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} /></SyncProvider></AuthProvider></SafeAreaProvider>; }
