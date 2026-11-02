import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { backoffDelay, boundedRetryCount, canRetryRequest, isRetryableStatus, retryDelay } from './backoff.ts';
describe('backoffDelay', () => { it('cresce exponencialmente sem ultrapassar o teto', () => { assert.equal(backoffDelay(0, 0.5), 500); assert.equal(backoffDelay(3, 0.5), 4000); assert.equal(backoffDelay(20, 0.5), 30000); }); });
describe('isRetryableStatus', () => { it('repete apenas falhas temporárias conhecidas', () => { assert.equal(isRetryableStatus(429), true); assert.equal(isRetryableStatus(503), true); assert.equal(isRetryableStatus(501), false); assert.equal(isRetryableStatus(400), false); assert.equal(isRetryableStatus(401), false); }); });
describe('política de repetição', () => {
  it('nega retry de mutação sem idempotência', () => { assert.equal(canRetryRequest('POST'), false); assert.equal(boundedRetryCount(3, 'PATCH'), 0); });
  it('limita retry seguro e aceita mutação idempotente', () => { assert.equal(boundedRetryCount(99, 'GET'), 4); assert.equal(boundedRetryCount(2, 'POST', 'op-1'), 2); });
  it('respeita Retry-After e aplica teto', () => { assert.equal(retryDelay('2', 0, 0, 0), 2_000); assert.equal(retryDelay('120', 0, 0, 0), 60_000); });
});
