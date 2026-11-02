import { describe, expect, it } from 'vitest';
import { hasValidPeriod, normalizeAppointmentInput } from './appointment.types';
describe('hasValidPeriod', () => {
  const base = { patientId: 'p', professionalId: 'u', kind: 'individual' };
  it('rejeita período invertido', () => {
    expect(
      hasValidPeriod({ ...base, startsAt: '2026-11-02T10:00', endsAt: '2026-11-02T09:00' }),
    ).toBe(false);
  });
  it('aceita período crescente', () => {
    expect(
      hasValidPeriod({ ...base, startsAt: '2026-11-02T09:00', endsAt: '2026-11-02T10:00' }),
    ).toBe(true);
  });
});

it('normaliza datetime-local para RFC3339 antes do comando Tauri', () => {
  const result = normalizeAppointmentInput({
    patientId: 'p1',
    professionalId: 'u1',
    startsAt: '2026-11-02T09:00',
    endsAt: '2026-11-02T10:00',
    kind: 'individual',
  });
  expect(result.startsAt).toMatch(/^2026-11-02T\d{2}:00:00\.000Z$/);
  expect(result.endsAt).toMatch(/^2026-11-02T\d{2}:00:00\.000Z$/);
});
