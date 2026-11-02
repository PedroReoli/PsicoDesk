import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { backoffDelay, isRetryableStatus } from './backoff.ts';
describe('backoffDelay', () => { it('cresce exponencialmente sem ultrapassar o teto', () => { assert.equal(backoffDelay(0, 0.5), 500); assert.equal(backoffDelay(3, 0.5), 4000); assert.equal(backoffDelay(20, 0.5), 30000); }); });
describe('isRetryableStatus', () => { it('repete apenas falhas temporárias', () => { assert.equal(isRetryableStatus(429), true); assert.equal(isRetryableStatus(503), true); assert.equal(isRetryableStatus(403), false); }); });
