import * as SecureStore from 'expo-secure-store';
import type { Session } from '../types/domain';
const SESSION_KEY = 'psicodesk.mobile.session.v1';
export async function saveSession(session: Session) { await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }); }
export async function readSession() { const value = await SecureStore.getItemAsync(SESSION_KEY); if (!value) return null; try { return JSON.parse(value) as Session; } catch { await deleteSession(); return null; } }
export async function deleteSession() { await SecureStore.deleteItemAsync(SESSION_KEY); }
