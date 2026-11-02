import { gcm } from '@noble/ciphers/aes.js';
import { bytesToHex, bytesToUtf8, hexToBytes, utf8ToBytes } from '@noble/ciphers/utils.js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
const DATA_KEY = 'psicodesk.mobile.data-key.v1';
let keyPromise: Promise<Uint8Array> | null = null;
async function loadOrCreateKey() {
  const stored = await SecureStore.getItemAsync(DATA_KEY);
  if (stored && /^[0-9a-f]{64}$/i.test(stored)) return hexToBytes(stored);
  if (stored) await SecureStore.deleteItemAsync(DATA_KEY);
  const generated = await Crypto.getRandomBytesAsync(32);
  await SecureStore.setItemAsync(DATA_KEY, bytesToHex(generated), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return generated;
}
async function getKey() {
  keyPromise ??= loadOrCreateKey().catch((cause) => {
    keyPromise = null;
    throw cause;
  });
  return keyPromise;
}
export async function encryptPayload(value: string) {
  const key = await getKey();
  const nonce = await Crypto.getRandomBytesAsync(12);
  const encrypted = gcm(key, nonce).encrypt(utf8ToBytes(value));
  return `${bytesToHex(nonce)}:${bytesToHex(encrypted)}`;
}
export async function decryptPayload(value: string) {
  const [nonceHex, payloadHex] = value.split(':');
  if (
    !nonceHex ||
    !payloadHex ||
    !/^[0-9a-f]{24}$/i.test(nonceHex) ||
    !/^[0-9a-f]+$/i.test(payloadHex) ||
    payloadHex.length % 2 !== 0
  )
    throw new Error('Payload local inválido.');
  const key = await getKey();
  const decrypted = gcm(key, hexToBytes(nonceHex)).decrypt(hexToBytes(payloadHex));
  return bytesToUtf8(decrypted);
}
export async function deleteDataKey() {
  const pending = keyPromise;
  keyPromise = null;
  await pending?.catch(() => undefined);
  await SecureStore.deleteItemAsync(DATA_KEY);
}
