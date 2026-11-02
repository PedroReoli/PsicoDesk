import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canAccess } from './permissions.ts';
describe('canAccess', () => { it('impede recepção de abrir prontuário e financeiro', () => { assert.equal(canAccess('receptionist', 'clinical'), false); assert.equal(canAccess('receptionist', 'finance'), false); }); it('permite prontuário somente ao psicólogo entre perfis clínicos', () => { assert.equal(canAccess('psychologist', 'clinical'), true); assert.equal(canAccess('admin', 'clinical'), false); }); it('nega acesso sem sessão', () => { assert.equal(canAccess(undefined, 'dashboard'), false); }); });
