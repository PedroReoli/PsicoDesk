import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { base64ToBytes, bytesToBase64 } from './base64.ts';
describe('base64', () => {
  it('preserva bytes binários e padding', () => {
    const input = Uint8Array.from([0, 1, 2, 253, 254, 255]);
    assert.deepEqual(base64ToBytes(bytesToBase64(input)), input);
  });
  it('rejeita formato não canônico', () => {
    assert.throws(() => base64ToBytes('***'));
  });
});
