import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isSafeApiPath, normalizeApiUrl } from './config.ts';

describe('normalizeApiUrl', () => {
  it('aceita somente HTTPS em produção', () => {
    assert.equal(normalizeApiUrl('https://api.psicodesk.test/'), 'https://api.psicodesk.test');
    assert.equal(normalizeApiUrl('http://api.psicodesk.test'), '');
  });
  it('rejeita credenciais e fragmentos embutidos', () => {
    assert.equal(normalizeApiUrl('https://token@api.psicodesk.test'), '');
    assert.equal(normalizeApiUrl('https://api.psicodesk.test/#segredo'), '');
  });
  it('permite HTTP apenas quando desenvolvimento autoriza', () => {
    assert.equal(normalizeApiUrl('http://10.0.2.2:3000', true), 'http://10.0.2.2:3000');
  });
});
describe('isSafeApiPath', () => {
  it('impede URL absoluta, protocol-relative e barra invertida', () => {
    assert.equal(isSafeApiPath('/v1/patients'), true);
    assert.equal(isSafeApiPath('https://evil.test'), false);
    assert.equal(isSafeApiPath('//evil.test/x'), false);
    assert.equal(isSafeApiPath('/v1\\evil'), false);
  });
});
