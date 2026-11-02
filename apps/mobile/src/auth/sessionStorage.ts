import * as SecureStore from 'expo-secure-store';
import type { DeviceCredentials } from '../types/sync';
import { parseCredentials } from './provisioningValidation';
const DEVICE_KEY = 'psicodesk.mobile.device.v2';
export interface StoredDevice { credentials: DeviceCredentials; accessToken: string | null; expiresAt: string | null; }
export async function saveDevice(value: StoredDevice) { await SecureStore.setItemAsync(DEVICE_KEY, JSON.stringify(value), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }); }
export async function readDevice(): Promise<StoredDevice | null> { const raw = await SecureStore.getItemAsync(DEVICE_KEY); if (!raw) return null; try { const parsed = JSON.parse(raw) as Partial<StoredDevice>; const credentials = parseCredentials(parsed.credentials); const accessToken = typeof parsed.accessToken === 'string' ? parsed.accessToken : null; const expiresAt = typeof parsed.expiresAt === 'string' && Number.isFinite(Date.parse(parsed.expiresAt)) ? parsed.expiresAt : null; return { credentials, accessToken, expiresAt }; } catch { await deleteDevice(); return null; } }
export async function deleteDevice() { await SecureStore.deleteItemAsync(DEVICE_KEY); }
