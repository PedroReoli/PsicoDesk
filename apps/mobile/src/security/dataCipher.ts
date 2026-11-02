import { gcm } from '@noble/ciphers/aes.js';
import { bytesToHex, bytesToUtf8, hexToBytes, utf8ToBytes } from '@noble/ciphers/utils.js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
const DATA_KEY = 'psicodesk.mobile.data-key.v1';
async function getKey() { const stored = await SecureStore.getItemAsync(DATA_KEY); if (stored) return hexToBytes(stored); const generated = await Crypto.getRandomBytesAsync(32); await SecureStore.setItemAsync(DATA_KEY, bytesToHex(generated), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }); return generated; }
export async function encryptPayload(value: string) { const key = await getKey(); const nonce = await Crypto.getRandomBytesAsync(12); const encrypted = gcm(key, nonce).encrypt(utf8ToBytes(value)); return `${bytesToHex(nonce)}:${bytesToHex(encrypted)}`; }
export async function decryptPayload(value: string) { const [nonceHex, payloadHex] = value.split(':'); if (!nonceHex || !payloadHex) throw new Error('Payload local inválido.'); const key = await getKey(); const decrypted = gcm(key, hexToBytes(nonceHex)).decrypt(hexToBytes(payloadHex)); return bytesToUtf8(decrypted); }
export async function deleteDataKey() { await SecureStore.deleteItemAsync(DATA_KEY); }
