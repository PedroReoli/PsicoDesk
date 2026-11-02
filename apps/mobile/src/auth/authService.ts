import { apiRequest, type ApiDependencies } from '../api/client';
import type { DeviceCredentials } from '../types/sync';
import { generateSigningIdentity, publicKeyFingerprint } from '../security/batchCrypto';
import { validateProvisioning, type ProvisioningInput } from './provisioningValidation';

interface RegistrationResponse { clinicId: string; deviceId: string; deviceSecret: string; scopes: string[]; signingPublicKey: string; signingKeyFingerprint: string; createdAt: string; }
interface TokenResponse { accessToken: string; tokenType: 'Bearer'; expiresIn: number; }
function isRegistration(value: unknown): value is RegistrationResponse { const item = value as Partial<RegistrationResponse>; return typeof item === 'object' && item !== null && typeof item.clinicId === 'string' && typeof item.deviceId === 'string' && typeof item.deviceSecret === 'string' && item.deviceSecret.length >= 32 && Array.isArray(item.scopes) && typeof item.signingPublicKey === 'string' && typeof item.signingKeyFingerprint === 'string' && typeof item.createdAt === 'string'; }
function isToken(value: unknown): value is TokenResponse { const item = value as Partial<TokenResponse>; return typeof item === 'object' && item !== null && typeof item.accessToken === 'string' && item.accessToken.length > 20 && item.tokenType === 'Bearer' && typeof item.expiresIn === 'number' && item.expiresIn > 0 && item.expiresIn <= 3_600; }
export async function registerDevice(input: ProvisioningInput, dependencies?: ApiDependencies) {
  const valid = validateProvisioning(input, dependencies?.allowInsecureDevelopment);
  if (await publicKeyFingerprint(valid.trustedPeerPublicKey) !== valid.trustedPeerFingerprint.toLowerCase()) throw new Error('O fingerprint informado não corresponde à chave pública do peer.');
  const signing = await generateSigningIdentity();
  const response = await apiRequest<unknown>('/v1/devices/register', { baseUrl: valid.serverUrl, method: 'POST', body: { clinicId: valid.clinicId, enrollmentToken: valid.enrollmentToken, deviceName: valid.deviceName, signingPublicKey: signing.signingPublicKey }, retries: 0 }, dependencies);
  if (!isRegistration(response) || response.clinicId !== valid.clinicId || response.signingPublicKey !== signing.signingPublicKey || response.signingKeyFingerprint !== signing.signingKeyFingerprint) throw new Error('Resposta de provisionamento inválida.');
  return { serverUrl: valid.serverUrl, clinicId: response.clinicId, deviceId: response.deviceId, deviceSecret: response.deviceSecret, role: valid.role, syncKeyHex: valid.syncKeyHex, syncKeyId: valid.syncKeyId, deviceName: valid.deviceName, signingPrivateKeyHex: signing.signingPrivateKeyHex, signingPublicKey: signing.signingPublicKey, peerDeviceId: valid.peerDeviceId, trustedPeerPublicKey: valid.trustedPeerPublicKey, trustedPeerFingerprint: valid.trustedPeerFingerprint.toLowerCase() } satisfies DeviceCredentials;
}
export async function issueDeviceToken(credentials: DeviceCredentials, dependencies?: ApiDependencies) {
  const response = await apiRequest<unknown>('/v1/auth/token', { baseUrl: credentials.serverUrl, method: 'POST', body: { clinicId: credentials.clinicId, deviceId: credentials.deviceId, deviceSecret: credentials.deviceSecret }, retries: 0 }, dependencies);
  if (!isToken(response)) throw new Error('Resposta de autenticação inválida.');
  return { accessToken: response.accessToken, expiresAt: new Date(Date.now() + response.expiresIn * 1_000).toISOString() };
}
