import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiError } from '../api/client.ts';
import type { BatchStore } from '../database/batchRepository.ts';
import {
  materializeTransferItems,
  type ProjectionWriter,
} from '../database/projectionMaterializer.ts';
import type { BatchEnvelope, BatchMetadata, DeviceCredentials, SyncCounts } from '../types/sync.ts';
import { BatchEngine, type BatchCryptography, type BatchTransport } from './BatchEngine.ts';
const credentials = {
  serverUrl: 'https://api.test',
  clinicId: '11111111-1111-4111-8111-111111111111',
  deviceId: '22222222-2222-4222-8222-222222222222',
  deviceSecret: 's'.repeat(32),
  deviceName: 'Mobile',
  role: 'psychologist',
  syncKeyHex: 'aa'.repeat(32),
  syncKeyId: 'clinic-v1',
  signingPrivateKeyHex: 'bb'.repeat(32),
  signingPublicKey: 'A'.repeat(43) + '=',
  peerDeviceId: '33333333-3333-4333-8333-333333333333',
  trustedPeerPublicKey: 'B'.repeat(43) + '=',
  trustedPeerFingerprint: 'cc'.repeat(32),
} satisfies DeviceCredentials;
const envelope = {
  schemaVersion: 1,
  batchId: '44444444-4444-4444-8444-444444444444',
  originDeviceId: credentials.deviceId,
  targetDeviceId: credentials.peerDeviceId,
  createdAt: '2030-01-01T00:00:00.000Z',
  expiresAt: '2030-01-01T00:10:00.000Z',
  contentHash: 'dd'.repeat(32),
  signerPublicKey: credentials.signingPublicKey,
  signature: 'C'.repeat(86) + '==',
  encryption: { algorithm: 'aes-256-gcm', keyId: 'clinic-v1', nonce: 'AAAAAAAAAAAAAAAA' },
  payloadBase64: 'AAAA',
} satisfies BatchEnvelope;
const metadata = {
  ...envelope,
  clinicId: credentials.clinicId,
  deliveryCursor: '1',
  status: 'pending',
  receivedAt: envelope.createdAt,
  acknowledgedAt: null,
} as BatchMetadata;
function setup(outgoing: BatchEnvelope[] = []) {
  const events: string[] = [];
  let cursor = '0';
  const counts: SyncCounts = { pending: outgoing.length, failed: 0, conflicts: 0, received: 0 };
  const store: BatchStore = {
    due: async () => outgoing,
    queue: async () => undefined,
    sent: async (id) => {
      events.push(`sent:${id}`);
    },
    failed: async (_id, code, _next, terminal) => {
      events.push(`failed:${code}:${String(terminal)}`);
    },
    cursor: async () => cursor,
    saveImported: async (_batch, payload) => {
      events.push(`saved:${JSON.stringify(payload)}`);
      counts.received += 1;
      return { importedAt: envelope.createdAt };
    },
    setCursor: async (next) => {
      cursor = next;
      events.push(`cursor:${next}`);
    },
    counts: async () => counts,
  };
  return { store, events };
}
function transport(overrides: Partial<BatchTransport> = {}): BatchTransport {
  return {
    send: async () => undefined,
    list: async () => ({ items: [], nextCursor: '0', hasMore: false }),
    payload: async () => envelope,
    acknowledge: async () => undefined,
    ...overrides,
  };
}
const crypto: BatchCryptography = { create: async () => envelope, open: async () => [] };
describe('BatchEngine', () => {
  it('materializa payload validado antes de confirmar o batch', async () => {
    const applied: string[] = [];
    const writer: ProjectionWriter = {
      revision: async () => null,
      upsert: async (item) => {
        applied.push(item.entityId);
      },
      remove: async () => undefined,
      conflict: async () => undefined,
    };
    const item = {
      entityType: 'patient',
      entityId: '55555555-5555-4555-8555-555555555555',
      revision: 1,
      operation: 'upsert',
      payload: { fullName: 'Paciente sincronizado', status: 'active' },
    } as const;
    const { store, events } = setup();
    store.saveImported = async (_batch, payload) => {
      await materializeTransferItems(writer, payload);
      events.push('projection');
      return { importedAt: envelope.createdAt };
    };
    await new BatchEngine(
      store,
      transport({
        list: async () => ({ items: [metadata], nextCursor: '1', hasMore: false }),
        acknowledge: async () => {
          events.push('ack');
        },
      }),
      { ...crypto, open: async () => [item] },
    ).run(credentials, 'token');
    assert.deepEqual(applied, [item.entityId]);
    assert.deepEqual(events.slice(0, 2), ['projection', 'ack']);
  });
  it('envia lote idempotente e aplica entrada antes do ACK', async () => {
    const { store, events } = setup([envelope]);
    await new BatchEngine(
      store,
      transport({
        list: async () => ({ items: [metadata], nextCursor: '1', hasMore: false }),
        acknowledge: async (_c, _t, _id, status) => {
          events.push(`ack:${status}`);
        },
      }),
      crypto,
    ).run(credentials, 'token');
    assert.deepEqual(events, [`sent:${envelope.batchId}`, 'saved:[]', 'ack:applied', 'cursor:1']);
  });
  it('preserva offline para retry e encerra conflito 409', async () => {
    const offline = setup([envelope]);
    await assert.rejects(() =>
      new BatchEngine(
        offline.store,
        transport({
          send: async () => {
            throw new ApiError('offline', 0, 'NETWORK_ERROR');
          },
        }),
        crypto,
      ).run(credentials, 'token'),
    );
    assert.match(offline.events[0] ?? '', /^failed:NETWORK_ERROR:false$/);
    const conflict = setup([envelope]);
    await new BatchEngine(
      conflict.store,
      transport({
        send: async () => {
          throw new ApiError('conflict', 409, 'CONFLICT');
        },
      }),
      crypto,
    ).run(credentials, 'token');
    assert.equal(conflict.events[0], 'failed:CONFLICT:true');
  });
  it('rejeita envelope inválido sem aplicá-lo', async () => {
    const { store, events } = setup();
    const rejecting: BatchCryptography = {
      ...crypto,
      open: async () => {
        throw new Error('signature');
      },
    };
    await new BatchEngine(
      store,
      transport({
        list: async () => ({ items: [metadata], nextCursor: '1', hasMore: false }),
        acknowledge: async (_c, _t, _id, status) => {
          events.push(`ack:${status}`);
        },
      }),
      rejecting,
    ).run(credentials, 'token');
    assert.deepEqual(events, ['ack:rejected', 'cursor:1']);
  });
  it('não rejeita lote válido quando o armazenamento local falha', async () => {
    const { store } = setup();
    let acknowledgements = 0;
    store.saveImported = async () => {
      throw new Error('sqlite indisponível');
    };
    const engine = new BatchEngine(
      store,
      transport({
        list: async () => ({ items: [metadata], nextCursor: '1', hasMore: false }),
        acknowledge: async () => {
          acknowledgements += 1;
        },
      }),
      crypto,
    );
    await assert.rejects(() => engine.run(credentials, 'token'), /sqlite indisponível/);
    assert.equal(acknowledgements, 0);
    store.saveImported = async () => ({ importedAt: envelope.createdAt });
    await engine.run(credentials, 'token');
    assert.equal(acknowledgements, 1);
  });
  it('reusa ACK estável e não reaplica lote após resposta perdida', async () => {
    const { store } = setup();
    const seen = new Map<string, string>();
    let applications = 0;
    const ackBodies: string[] = [];
    store.saveImported = async (batch) => {
      const prior = seen.get(batch.batchId);
      if (prior) return { importedAt: prior };
      applications += 1;
      const importedAt = '2030-01-02T00:00:00.000Z';
      seen.set(batch.batchId, importedAt);
      return { importedAt };
    };
    const engine = new BatchEngine(
      store,
      transport({
        list: async () => ({ items: [metadata], nextCursor: '1', hasMore: false }),
        acknowledge: async (_c, _t, _id, _status, importedAt) => {
          ackBodies.push(importedAt);
          if (ackBodies.length === 1) throw new ApiError('resposta perdida', 0, 'NETWORK_ERROR');
        },
      }),
      crypto,
    );
    await assert.rejects(() => engine.run(credentials, 'token'));
    await engine.run(credentials, 'token');
    assert.equal(applications, 1);
    assert.deepEqual(ackBodies, ['2030-01-02T00:00:00.000Z', '2030-01-02T00:00:00.000Z']);
  });
});
