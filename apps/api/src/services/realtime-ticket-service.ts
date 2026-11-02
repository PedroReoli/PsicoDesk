import { createHash, randomBytes } from 'node:crypto';
import type { RealtimeTicketResult } from '@psicodesk/sync-protocol';
import { errors } from '../domain/errors.js';
import type { Principal } from '../domain/types.js';
import { requireScope } from './batch-service.js';

interface TicketRecord {
  principal: Principal;
  expiresAtMs: number;
  deviceKey: string;
}

export interface RealtimeTicketGenerators {
  ticket(): string;
  now(): number;
}

const defaultGenerators: RealtimeTicketGenerators = {
  ticket: () => randomBytes(32).toString('base64url'),
  now: () => Date.now(),
};

export class RealtimeTicketService {
  private readonly tickets = new Map<string, TicketRecord>();
  private readonly ticketByDevice = new Map<string, string>();

  constructor(
    private readonly ttlMs = 60_000,
    private readonly generators: RealtimeTicketGenerators = defaultGenerators,
  ) {}

  issue(principal: Principal): RealtimeTicketResult {
    requireScope(principal, 'realtime:connect');
    const now = this.generators.now();
    this.removeExpired(now);
    const ticket = this.generators.ticket();
    const ticketHash = hashTicket(ticket);
    const deviceKey = `${principal.clinicId}:${principal.deviceId}`;
    const previous = this.ticketByDevice.get(deviceKey);
    if (previous) this.tickets.delete(previous);
    const expiresAtMs = now + this.ttlMs;
    this.tickets.set(ticketHash, { principal: { ...principal }, expiresAtMs, deviceKey });
    this.ticketByDevice.set(deviceKey, ticketHash);
    return { ticket, expiresAt: new Date(expiresAtMs).toISOString() };
  }

  consume(ticket: string): Principal {
    const ticketHash = hashTicket(ticket);
    const record = this.tickets.get(ticketHash);
    this.tickets.delete(ticketHash);
    if (record && this.ticketByDevice.get(record.deviceKey) === ticketHash)
      this.ticketByDevice.delete(record.deviceKey);
    if (!record || record.expiresAtMs <= this.generators.now()) throw errors.unauthenticated();
    return { ...record.principal };
  }

  private removeExpired(now: number): void {
    for (const [ticketHash, record] of this.tickets) {
      if (record.expiresAtMs <= now) {
        this.tickets.delete(ticketHash);
        if (this.ticketByDevice.get(record.deviceKey) === ticketHash)
          this.ticketByDevice.delete(record.deviceKey);
      }
    }
  }
}

function hashTicket(ticket: string): string {
  return createHash('sha256').update(ticket, 'utf8').digest('hex');
}
