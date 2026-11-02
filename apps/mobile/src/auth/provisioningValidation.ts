import { normalizeApiUrl } from '../api/config.ts';
import type { DeviceCredentials, MobileRole } from '../types/sync';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export interface ProvisioningInput {
  serverUrl: string;
  clinicId: string;
  enrollmentToken: string;
  deviceName: string;
  role: MobileRole;
  syncKeyHex: string;
  syncKeyId: string;
  peerDeviceId: string;
  trustedPeerPublicKey: string;
  trustedPeerFingerprint: string;
}
const roles = new Set<MobileRole>(['owner', 'admin', 'psychologist', 'receptionist', 'finance']);
const development = typeof __DEV__ !== 'undefined' && __DEV__;
export function validateProvisioning(input: ProvisioningInput, allowHttp = development) {
  const serverUrl = normalizeApiUrl(input.serverUrl, allowHttp);
  if (!serverUrl) throw new Error('Informe uma URL HTTPS válida do servidor.');
  if (!uuid.test(input.clinicId)) throw new Error('O identificador da clínica é inválido.');
  if (input.enrollmentToken.length < 32 || input.enrollmentToken.length > 512)
    throw new Error('O token de provisionamento é inválido.');
  const deviceName = input.deviceName.trim();
  if (deviceName.length < 2 || deviceName.length > 100)
    throw new Error('Informe um nome de dispositivo válido.');
  if (!roles.has(input.role)) throw new Error('O papel do dispositivo é inválido.');
  if (!/^[0-9a-f]{64}$/i.test(input.syncKeyHex))
    throw new Error('A chave de sincronização deve ter 64 caracteres hexadecimais.');
  const syncKeyId = input.syncKeyId.trim();
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(syncKeyId))
    throw new Error('O identificador da chave é inválido.');
  if (!uuid.test(input.peerDeviceId))
    throw new Error('O identificador do dispositivo pareado é inválido.');
  if (!/^[A-Za-z0-9+/]{43}=$/.test(input.trustedPeerPublicKey))
    throw new Error('A chave pública do peer é inválida.');
  if (!/^[0-9a-f]{64}$/i.test(input.trustedPeerFingerprint))
    throw new Error('O fingerprint do peer é inválido.');
  return { ...input, serverUrl, deviceName, syncKeyHex: input.syncKeyHex.toLowerCase(), syncKeyId };
}
export function parseCredentials(value: unknown): DeviceCredentials {
  if (typeof value !== 'object' || value === null) throw new Error('Provisionamento inválido.');
  const candidate = value as Partial<DeviceCredentials>;
  const serverUrl = normalizeApiUrl(candidate.serverUrl, development);
  if (
    !serverUrl ||
    !candidate.clinicId ||
    !uuid.test(candidate.clinicId) ||
    !candidate.deviceId ||
    !uuid.test(candidate.deviceId) ||
    typeof candidate.deviceSecret !== 'string' ||
    candidate.deviceSecret.length < 32 ||
    candidate.deviceSecret.length > 512 ||
    typeof candidate.syncKeyHex !== 'string' ||
    !/^[0-9a-f]{64}$/i.test(candidate.syncKeyHex) ||
    typeof candidate.syncKeyId !== 'string' ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(candidate.syncKeyId) ||
    typeof candidate.deviceName !== 'string' ||
    candidate.deviceName.length < 2 ||
    candidate.deviceName.length > 100 ||
    !candidate.role ||
    !roles.has(candidate.role) ||
    typeof candidate.signingPrivateKeyHex !== 'string' ||
    !/^[0-9a-f]{64}$/i.test(candidate.signingPrivateKeyHex) ||
    typeof candidate.signingPublicKey !== 'string' ||
    !/^[A-Za-z0-9+/]{43}=$/.test(candidate.signingPublicKey) ||
    typeof candidate.peerDeviceId !== 'string' ||
    !uuid.test(candidate.peerDeviceId) ||
    typeof candidate.trustedPeerPublicKey !== 'string' ||
    !/^[A-Za-z0-9+/]{43}=$/.test(candidate.trustedPeerPublicKey) ||
    typeof candidate.trustedPeerFingerprint !== 'string' ||
    !/^[0-9a-f]{64}$/i.test(candidate.trustedPeerFingerprint)
  )
    throw new Error('Provisionamento inválido.');
  return {
    serverUrl,
    clinicId: candidate.clinicId,
    deviceId: candidate.deviceId,
    deviceSecret: candidate.deviceSecret,
    role: candidate.role,
    syncKeyHex: candidate.syncKeyHex.toLowerCase(),
    syncKeyId: candidate.syncKeyId,
    deviceName: candidate.deviceName,
    signingPrivateKeyHex: candidate.signingPrivateKeyHex.toLowerCase(),
    signingPublicKey: candidate.signingPublicKey,
    peerDeviceId: candidate.peerDeviceId,
    trustedPeerPublicKey: candidate.trustedPeerPublicKey,
    trustedPeerFingerprint: candidate.trustedPeerFingerprint.toLowerCase(),
  };
}
