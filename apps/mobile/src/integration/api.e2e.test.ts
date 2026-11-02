import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { apiRequest, ApiError, type ApiDependencies } from '../api/client.ts';
import { ApiBatchTransport } from '../sync/BatchEngine.ts';
import type { BatchEnvelope, DeviceCredentials } from '../types/sync.ts';
const helperPath = '../../../api/dist/testing/test-app.js';
const localHttp: ApiDependencies = {
  fetch,
  sleep: async () => undefined,
  allowInsecureDevelopment: true,
};
interface Fixture {
  clinicId: string;
  enrollmentToken: string;
  registeredDeviceId: string;
  senderDeviceId: string;
  receiverDeviceId: string;
  deviceSecret: string;
  senderPublicKey: string;
  receiverPublicKey: string;
}
type Server = { baseUrl: string; close(): Promise<void>; fixture: Fixture };
describe('mobile contra Fastify real', () => {
  let server: Server;
  before(async () => {
    const helper = (await import(helperPath)) as {
      startDeterministicTestServer(): Promise<Server>;
    };
    server = await helper.startDeterministicTestServer();
  });
  after(async () => server.close());
  it('provisiona uma vez, autentica e nunca recebe chave clínica', async () => {
    const body = {
      clinicId: server.fixture.clinicId,
      enrollmentToken: server.fixture.enrollmentToken,
      deviceName: 'Mobile E2E',
      signingPublicKey: Buffer.alloc(32, 4).toString('base64'),
    };
    const registered = await apiRequest<Record<string, unknown>>(
      '/v1/devices/register',
      { baseUrl: server.baseUrl, method: 'POST', body, retries: 0 },
      localHttp,
    );
    assert.equal(registered.deviceId, server.fixture.registeredDeviceId);
    assert.equal('syncKey' in registered, false);
    const token = await apiRequest<{ accessToken: string }>(
      '/v1/auth/token',
      {
        baseUrl: server.baseUrl,
        method: 'POST',
        body: {
          clinicId: server.fixture.clinicId,
          deviceId: registered.deviceId,
          deviceSecret: registered.deviceSecret,
        },
        retries: 0,
      },
      localHttp,
    );
    assert.ok(token.accessToken.length > 20);
    await assert.rejects(
      () =>
        apiRequest(
          '/v1/devices/register',
          { baseUrl: server.baseUrl, method: 'POST', body, retries: 0 },
          localHttp,
        ),
      (error: unknown) => error instanceof ApiError && error.status === 401,
    );
  });
  it('transporta envelope opaco até o target e confirma ACK', async () => {
    const tokenFor = (deviceId: string) =>
      apiRequest<{ accessToken: string }>(
        '/v1/auth/token',
        {
          baseUrl: server.baseUrl,
          method: 'POST',
          body: {
            clinicId: server.fixture.clinicId,
            deviceId,
            deviceSecret: server.fixture.deviceSecret,
          },
          retries: 0,
        },
        localHttp,
      );
    const senderToken = (await tokenFor(server.fixture.senderDeviceId)).accessToken;
    const receiverToken = (await tokenFor(server.fixture.receiverDeviceId)).accessToken;
    const payload = Buffer.from('opaque-mobile-e2e');
    const envelope = makeEnvelope(server.fixture, payload);
    const base = credentials(server.fixture, server.baseUrl);
    const sender = { ...base, deviceId: server.fixture.senderDeviceId } satisfies DeviceCredentials;
    const receiver = {
      ...base,
      deviceId: server.fixture.receiverDeviceId,
      peerDeviceId: server.fixture.senderDeviceId,
      signingPublicKey: server.fixture.receiverPublicKey,
      trustedPeerPublicKey: server.fixture.senderPublicKey,
    } satisfies DeviceCredentials;
    const transport = new ApiBatchTransport(localHttp);
    await transport.send(sender, senderToken, envelope);
    await transport.send(sender, senderToken, envelope);
    const listed = await transport.list(receiver, receiverToken, '0');
    assert.equal(listed.items.length, 1);
    const downloaded = await transport.payload(receiver, receiverToken, listed.items[0]!);
    assert.equal(downloaded.payloadBase64, envelope.payloadBase64);
    await transport.acknowledge(receiver, receiverToken, envelope.batchId, 'applied');
  });
  it('aceita replay idêntico do ACK após resposta perdida', async () => {
    const tokenFor = (deviceId: string) =>
      apiRequest<{ accessToken: string }>(
        '/v1/auth/token',
        {
          baseUrl: server.baseUrl,
          method: 'POST',
          body: {
            clinicId: server.fixture.clinicId,
            deviceId,
            deviceSecret: server.fixture.deviceSecret,
          },
          retries: 0,
        },
        localHttp,
      );
    const senderToken = (await tokenFor(server.fixture.senderDeviceId)).accessToken;
    const receiverToken = (await tokenFor(server.fixture.receiverDeviceId)).accessToken;
    const envelope = makeEnvelope(server.fixture, Buffer.from('opaque-ack-replay'));
    const base = credentials(server.fixture, server.baseUrl);
    const transport = new ApiBatchTransport(localHttp);
    await transport.send(
      { ...base, deviceId: server.fixture.senderDeviceId },
      senderToken,
      envelope,
    );
    const receiver = {
      ...base,
      deviceId: server.fixture.receiverDeviceId,
      peerDeviceId: server.fixture.senderDeviceId,
      signingPublicKey: server.fixture.receiverPublicKey,
      trustedPeerPublicKey: server.fixture.senderPublicKey,
    };
    const importedAt = '2030-01-01T00:05:00.000Z';
    await transport.acknowledge(receiver, receiverToken, envelope.batchId, 'applied', importedAt);
    await transport.acknowledge(receiver, receiverToken, envelope.batchId, 'applied', importedAt);
  });
  it('rejeita autenticação inválida sem retry', async () => {
    await assert.rejects(
      () =>
        apiRequest(
          '/v1/auth/token',
          {
            baseUrl: server.baseUrl,
            method: 'POST',
            body: {
              clinicId: server.fixture.clinicId,
              deviceId: server.fixture.senderDeviceId,
              deviceSecret: 'invalid-secret-that-is-long-enough',
            },
            retries: 2,
          },
          localHttp,
        ),
      (error: unknown) => error instanceof ApiError && error.status === 401,
    );
  });
});
function credentials(f: Fixture, serverUrl: string) {
  return {
    serverUrl,
    clinicId: f.clinicId,
    deviceSecret: f.deviceSecret,
    deviceName: 'E2E',
    role: 'psychologist',
    syncKeyHex: 'aa'.repeat(32),
    syncKeyId: 'clinic-key:v1',
    signingPrivateKeyHex: 'bb'.repeat(32),
    signingPublicKey: f.senderPublicKey,
    peerDeviceId: f.receiverDeviceId,
    trustedPeerPublicKey: f.receiverPublicKey,
    trustedPeerFingerprint: 'cc'.repeat(32),
  } as const;
}
function makeEnvelope(f: Fixture, payload: Buffer): BatchEnvelope {
  return {
    schemaVersion: 1,
    batchId: randomUUID(),
    originDeviceId: f.senderDeviceId,
    targetDeviceId: f.receiverDeviceId,
    createdAt: '2030-01-01T00:00:00.000Z',
    expiresAt: '2030-01-01T00:10:00.000Z',
    contentHash: createHash('sha256').update(payload).digest('hex'),
    signerPublicKey: f.senderPublicKey,
    signature: `${'A'.repeat(86)}==`,
    encryption: { algorithm: 'aes-256-gcm', keyId: 'clinic-key:v1', nonce: 'YWJjZGVmZ2hpamts' },
    payloadBase64: payload.toString('base64'),
  };
}
