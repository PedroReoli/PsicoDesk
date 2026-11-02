import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_MUTATION_ATTEMPTS, mutationFailurePolicy } from './queuePolicy.ts';

describe('mutationFailurePolicy', () => {
  it('interrompe rejeição permanente sem persistir mensagem externa', () => {
    assert.deepEqual(mutationFailurePolicy({ status: 403, code: 'qualquer-dado-externo' }, 1, 0), {
      terminal: true,
      code: 'MUTATION_REJECTED',
      delayMs: 0,
    });
  });
  it('mantém falha de rede em backoff limitado', () => {
    assert.deepEqual(mutationFailurePolicy({ status: 0, code: 'NETWORK_ERROR' }, 2, 0.5), {
      terminal: false,
      code: 'NETWORK_ERROR',
      delayMs: 2_000,
    });
  });
  it('encerra poison message após o limite', () => {
    assert.equal(mutationFailurePolicy({ status: 503 }, MAX_MUTATION_ATTEMPTS, 0).terminal, true);
  });
});
