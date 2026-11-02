import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deterministicFixture, startDeterministicTestServer } from './test-app.js';

describe('servidor fake por HTTP real', () => {
  let server: Awaited<ReturnType<typeof startDeterministicTestServer>>;

  beforeAll(async () => {
    server = await startDeterministicTestServer();
  });

  afterAll(async () => server.close());

  it('transporta batch opaco entre dois tokens por porta efêmera', async () => {
    expect((await fetch(`${server.baseUrl}/health`)).status).toBe(200);
    const senderToken = await tokenFor(
      deterministicFixture.clinicId,
      deterministicFixture.senderDeviceId,
    );
    const receiverToken = await tokenFor(
      deterministicFixture.clinicId,
      deterministicFixture.receiverDeviceId,
    );
    const opaque = Buffer.from('real-http-opaque-ciphertext');
    const batchId = randomUUID();
    const response = await fetch(`${server.baseUrl}/v1/batches`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${senderToken}`,
        'content-type': 'application/json',
        'idempotency-key': 'real-http-idempotency-000001',
      },
      body: JSON.stringify({
        schemaVersion: 1,
        batchId,
        originDeviceId: deterministicFixture.senderDeviceId,
        targetDeviceId: deterministicFixture.receiverDeviceId,
        createdAt: deterministicFixture.now,
        expiresAt: '2030-01-01T00:10:00.000Z',
        contentHash: createHash('sha256').update(opaque).digest('hex'),
        signerPublicKey: deterministicFixture.senderPublicKey,
        signature: `${'A'.repeat(86)}==`,
        encryption: {
          algorithm: 'aes-256-gcm',
          keyId: 'clinic-key:v1',
          nonce: 'YWJjZGVmZ2hpamts',
        },
        payloadBase64: opaque.toString('base64'),
      }),
    });
    expect(response.status).toBe(201);
    const listed = await fetch(`${server.baseUrl}/v1/batches?cursor=0`, {
      headers: { authorization: `Bearer ${receiverToken}` },
    });
    expect((await listed.json()).items).toEqual([expect.objectContaining({ batchId })]);
  });

  async function tokenFor(clinicId: string, deviceId: string): Promise<string> {
    const response = await fetch(`${server.baseUrl}/v1/auth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        clinicId,
        deviceId,
        deviceSecret: deterministicFixture.deviceSecret,
      }),
    });
    expect(response.status).toBe(200);
    return (await response.json()).accessToken;
  }
});
