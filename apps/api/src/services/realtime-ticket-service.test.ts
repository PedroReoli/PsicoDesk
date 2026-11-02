import { describe, expect, it } from 'vitest';
import type { Principal } from '../domain/types.js';
import { RealtimeTicketService } from './realtime-ticket-service.js';

const principal: Principal = {
  clinicId: '10000000-0000-4000-8000-000000000001',
  deviceId: '20000000-0000-4000-8000-000000000001',
  scopes: ['realtime:connect'],
  signingPublicKey: null,
};

describe('RealtimeTicketService', () => {
  it('rejeita ticket expirado e replay', () => {
    let now = 1_000;
    let sequence = 0;
    const service = new RealtimeTicketService(100, {
      ticket: () => `ticket-value-with-at-least-32-characters-${++sequence}`,
      now: () => now,
    });
    const expired = service.issue(principal);
    now = 1_101;
    expect(() => service.consume(expired.ticket)).toThrowError('Autenticação necessária.');
    now = 2_000;
    const valid = service.issue(principal);
    expect(service.consume(valid.ticket)).toMatchObject({ deviceId: principal.deviceId });
    expect(() => service.consume(valid.ticket)).toThrowError('Autenticação necessária.');
  });

  it('invalida ticket anterior quando o mesmo dispositivo solicita outro', () => {
    let sequence = 0;
    const service = new RealtimeTicketService(100, {
      ticket: () => `ticket-value-with-at-least-32-characters-${++sequence}`,
      now: () => 1_000,
    });
    const first = service.issue(principal);
    const second = service.issue(principal);
    expect(() => service.consume(first.ticket)).toThrowError('Autenticação necessária.');
    expect(service.consume(second.ticket)).toMatchObject({ clinicId: principal.clinicId });
  });
});
