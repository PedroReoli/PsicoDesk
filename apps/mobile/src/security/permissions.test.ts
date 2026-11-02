import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canAccess } from './permissions.ts';
describe('canAccess', () => {
  it('impede recepção de abrir prontuário e financeiro', () => {
    assert.equal(canAccess('receptionist', 'clinical'), false);
    assert.equal(canAccess('receptionist', 'finance'), false);
  });
  it('permite prontuário somente ao psicólogo entre perfis clínicos', () => {
    assert.equal(canAccess('psychologist', 'clinical'), true);
    assert.equal(canAccess('admin', 'clinical'), false);
  });
  it('nega acesso sem sessão', () => {
    assert.equal(canAccess(undefined, 'dashboard'), false);
  });
});
describe('segregação de dados por papel', () => {
  it('não expõe agenda nem pacientes ao financeiro', () => {
    assert.equal(canAccess('finance', 'schedule'), false);
    assert.equal(canAccess('finance', 'patients'), false);
    assert.equal(canAccess('finance', 'clinical'), false);
  });
  it('não expõe valores ao psicólogo', () => {
    assert.equal(canAccess('psychologist', 'finance'), false);
  });
  it('mantém configurações administrativas restritas', () => {
    assert.equal(canAccess('owner', 'settings'), true);
    assert.equal(canAccess('admin', 'settings'), true);
    assert.equal(canAccess('receptionist', 'settings'), false);
    assert.equal(canAccess('finance', 'settings'), false);
  });
});
