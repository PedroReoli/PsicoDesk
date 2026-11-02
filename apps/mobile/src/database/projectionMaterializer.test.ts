import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ProjectionEntity, TransferItem } from '../types/sync.ts';
import {
  materializeTransferItemsAtomic,
  parseTransferItems,
  type ProjectionTransaction,
  type ProjectionWriter,
} from './projectionMaterializer.ts';
function memoryStore(failEntity?: string) {
  const records = new Map<string, TransferItem>();
  const conflicts: string[] = [];
  const key = (type: ProjectionEntity, id: string) => `${type}:${id}`;
  const store: ProjectionTransaction = {
    async transaction(work) {
      const snapshot = new Map(records);
      const conflictSnapshot = [...conflicts];
      const writer: ProjectionWriter = {
        revision: async (type, id) => records.get(key(type, id))?.revision ?? null,
        upsert: async (item) => {
          if (item.entityId === failEntity) throw new Error('injected failure');
          records.set(key(item.entityType, item.entityId), item);
        },
        remove: async (type, id) => {
          records.delete(key(type, id));
        },
        conflict: async (_item, reason) => {
          conflicts.push(reason);
        },
      };
      try {
        return await work(writer);
      } catch (cause) {
        records.clear();
        for (const [id, item] of snapshot) records.set(id, item);
        conflicts.splice(0, conflicts.length, ...conflictSnapshot);
        throw cause;
      }
    },
  };
  return { store, records, conflicts };
}
const patient = {
  entityType: 'patient',
  entityId: '11111111-1111-4111-8111-111111111111',
  revision: 1,
  operation: 'upsert',
  payload: { fullName: 'Pessoa real recebida do desktop', status: 'active' },
} satisfies TransferItem;
describe('materialização de projeções offline', () => {
  it('aplica TransferItem validado para leitura da tela', async () => {
    const memory = memoryStore();
    assert.deepEqual(await materializeTransferItemsAtomic(memory.store, [patient]), {
      applied: 1,
      conflicts: 0,
    });
    assert.equal(
      memory.records.get(`patient:${patient.entityId}`)?.payload.fullName,
      patient.payload.fullName,
    );
  });
  it('não sobrescreve revisão mais nova por lote atrasado', async () => {
    const memory = memoryStore();
    await materializeTransferItemsAtomic(memory.store, [{ ...patient, revision: 2 }]);
    assert.deepEqual(await materializeTransferItemsAtomic(memory.store, [patient]), {
      applied: 0,
      conflicts: 1,
    });
    assert.equal(memory.records.get(`patient:${patient.entityId}`)?.revision, 2);
  });
  it('faz rollback do item 1 se o item 2 falhar', async () => {
    const second = { ...patient, entityId: '22222222-2222-4222-8222-222222222222' };
    const memory = memoryStore(second.entityId);
    await assert.rejects(
      () => materializeTransferItemsAtomic(memory.store, [patient, second]),
      /injected failure/,
    );
    assert.equal(memory.records.size, 0);
  });
  it('rejeita entidade e identificador não canônicos', () => {
    assert.throws(() => parseTransferItems([{ ...patient, entityType: 'secret' }]));
    assert.throws(() => parseTransferItems([{ ...patient, entityId: '../patient' }]));
  });
});
