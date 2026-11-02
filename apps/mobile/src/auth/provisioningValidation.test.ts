import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateProvisioning } from './provisioningValidation.ts';
const valid = {
  serverUrl: 'http://127.0.0.1:3000',
  clinicId: '11111111-1111-4111-8111-111111111111',
  enrollmentToken: 'e'.repeat(32),
  deviceName: 'Celular',
  role: 'psychologist' as const,
  syncKeyHex: 'aa'.repeat(32),
  syncKeyId: 'clinic-v1',
  peerDeviceId: '22222222-2222-4222-8222-222222222222',
  trustedPeerPublicKey: 'A'.repeat(43) + '=',
  trustedPeerFingerprint: 'bb'.repeat(32),
};
describe('validateProvisioning', () => {
  it('aceita bundle completo somente em desenvolvimento HTTP', () => {
    assert.equal(validateProvisioning(valid, true).deviceName, 'Celular');
  });
  it('rejeita segredo clínico ou peer incompletos', () => {
    assert.throws(() => validateProvisioning({ ...valid, syncKeyHex: 'aa' }, true));
    assert.throws(() => validateProvisioning({ ...valid, peerDeviceId: 'desktop' }, true));
  });
  it('exige HTTPS em produção', () => {
    assert.throws(() => validateProvisioning(valid, false), /HTTPS/);
  });
});
