import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { describe, it } from 'node:test';
import { bytesToHex, hexToBytes } from '@noble/ciphers/utils.js';
import * as ed from '@noble/ed25519';
import type { BatchEnvelope } from '../types/sync.ts';
import { batchSigningBytes } from './batchSigning.ts';
ed.hashes.sha512Async = async (message: Uint8Array) =>
  new Uint8Array(await webcrypto.subtle.digest('SHA-512', message.slice().buffer as ArrayBuffer));
describe('assinatura Ed25519 interoperável', () => {
  it('reproduz o vetor RFC 8032 usado também pelo Rust', async () => {
    const seed = hexToBytes('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60');
    const expectedPublic = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
    const expectedSignature =
      'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b';
    const publicKey = await ed.getPublicKeyAsync(seed);
    const signature = await ed.signAsync(new Uint8Array(), seed);
    assert.equal(bytesToHex(publicKey), expectedPublic);
    assert.equal(bytesToHex(signature), expectedSignature);
    assert.equal(await ed.verifyAsync(signature, new Uint8Array(), publicKey), true);
  });
  it('serializa exatamente o contrato psicodesk-batch-v1', () => {
    const unsigned = {
      schemaVersion: 1,
      batchId: '11111111-1111-4111-8111-111111111111',
      originDeviceId: '22222222-2222-4222-8222-222222222222',
      targetDeviceId: '33333333-3333-4333-8333-333333333333',
      createdAt: '2030-01-01T00:00:00.000Z',
      expiresAt: '2030-01-01T00:10:00.000Z',
      contentHash: 'aa'.repeat(32),
      signerPublicKey: 'A'.repeat(43) + '=',
      encryption: { algorithm: 'aes-256-gcm', keyId: 'clinic-v1', nonce: 'YWJjZGVmZ2hpamts' },
      payloadBase64: 'b3BhcXVl',
    } satisfies Omit<BatchEnvelope, 'signature'>;
    assert.equal(
      new TextDecoder().decode(batchSigningBytes(unsigned)),
      `psicodesk-batch-v1\n1\n${unsigned.batchId}\n${unsigned.originDeviceId}\n${unsigned.targetDeviceId}\n${unsigned.createdAt}\n${unsigned.expiresAt}\n${unsigned.contentHash}\naes-256-gcm\nclinic-v1\nYWJjZGVmZ2hpamts\nb3BhcXVl`,
    );
  });
  it('normaliza hash uppercase antes de assinar', () => {
    const unsigned = {
      schemaVersion: 1,
      batchId: '11111111-1111-4111-8111-111111111111',
      originDeviceId: '22222222-2222-4222-8222-222222222222',
      targetDeviceId: '33333333-3333-4333-8333-333333333333',
      createdAt: '2030-01-01T00:00:00.000Z',
      expiresAt: '2030-01-01T00:10:00.000Z',
      contentHash: 'AB'.repeat(32),
      signerPublicKey: 'A'.repeat(43) + '=',
      encryption: { algorithm: 'aes-256-gcm', keyId: 'clinic-v1', nonce: 'YWJjZGVmZ2hpamts' },
      payloadBase64: 'b3BhcXVl',
    } satisfies Omit<BatchEnvelope, 'signature'>;
    assert.match(
      new TextDecoder().decode(batchSigningBytes(unsigned)),
      new RegExp(`\\n${'ab'.repeat(32)}\\n`),
    );
  });
});
