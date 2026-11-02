import { describe, expect, it } from 'vitest';
import { validateClinicalBody } from './clinical-record.types';
describe('validateClinicalBody', () => {
  it('rejeita registro vazio', () => {
    expect(validateClinicalBody('curto')).toBeTruthy();
  });
  it('aceita descrição clínica suficiente', () => {
    expect(validateClinicalBody('Descrição objetiva do atendimento realizado.')).toBeNull();
  });
});
