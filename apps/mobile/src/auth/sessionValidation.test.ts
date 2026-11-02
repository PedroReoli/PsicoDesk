import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSession, securityContextChanged } from './sessionValidation.ts';

const valid = { accessToken: 'access', refreshToken: 'refresh', expiresAt: '2030-01-01T00:00:00.000Z', user: { id: 'u-1', displayName: 'Profissional', role: 'psychologist' } };
describe('parseSession', () => {
  it('aceita contrato conhecido', () => { assert.equal(parseSession(valid).user.role, 'psychologist'); });
  it('rejeita papel injetado pelo cliente', () => { assert.throws(() => parseSession({ ...valid, user: { ...valid.user, role: 'super-admin' } }), /Sessão inválida/); });
  it('rejeita tokens e expiração ausentes ou inválidos', () => { assert.throws(() => parseSession({ ...valid, accessToken: '' }), /Sessão inválida/); assert.throws(() => parseSession({ ...valid, expiresAt: 'amanhã' }), /Sessão inválida/); });
});
describe('securityContextChanged', () => {
  it('detecta troca de usuário e redução de papel', () => { const session = parseSession(valid); assert.equal(securityContextChanged(session, parseSession({ ...valid, user: { ...valid.user, role: 'receptionist' } })), true); assert.equal(securityContextChanged(session, parseSession({ ...valid, user: { ...valid.user, id: 'u-2' } })), true); });
  it('preserva cache no refresh do mesmo contexto', () => { const session = parseSession(valid); assert.equal(securityContextChanged(session, { ...session, accessToken: 'new-access' }), false); });
});
