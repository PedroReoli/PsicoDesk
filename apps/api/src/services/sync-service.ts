import type { SyncPush } from '@psicodesk/sync-protocol';
import { errors } from '../domain/errors.js';
import type { Principal, PullOutcome, PushOutcome } from '../domain/types.js';
import type { SyncRepository } from '../repositories/contracts.js';
import { requireScope } from './batch-service.js';

export class SyncService {
  constructor(private readonly repository: SyncRepository) {}

  async push(principal: Principal, input: SyncPush): Promise<PushOutcome> {
    requireScope(principal, 'sync:write');
    if (input.deviceId !== principal.deviceId) throw errors.forbidden();
    return this.repository.push(principal.clinicId, principal.deviceId, input);
  }

  async pull(principal: Principal, cursor: string, limit: number): Promise<PullOutcome> {
    requireScope(principal, 'sync:read');
    if (!/^\d+$/.test(cursor)) throw errors.badRequest('Cursor inválido.');
    if (!Number.isInteger(limit) || limit < 1 || limit > 500)
      throw errors.badRequest('Limite deve estar entre 1 e 500.');
    return this.repository.pull(principal.clinicId, principal.deviceId, cursor, limit);
  }
}
