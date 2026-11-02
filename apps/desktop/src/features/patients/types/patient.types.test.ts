import { describe, expect, it } from 'vitest';
import { validatePatient } from './patient.types';

describe('validatePatient', () => {
  it('rejeita nome incompleto e e-mail inválido', () => {
    expect(validatePatient({ fullName: 'A', email: 'inválido' })).toEqual({ fullName: 'Informe o nome completo.', email: 'Informe um e-mail válido.' });
  });
  it('aceita cadastro mínimo válido', () => { expect(validatePatient({ fullName: 'Paciente de Teste' })).toEqual({}); });
});
