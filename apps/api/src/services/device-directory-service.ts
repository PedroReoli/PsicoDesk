import type { DevicePeerList } from '@psicodesk/sync-protocol';
import type { Principal } from '../domain/types.js';
import type { DeviceDirectoryRepository } from '../repositories/contracts.js';
import { requireScope } from './batch-service.js';

export class DeviceDirectoryService {
  constructor(private readonly repository: DeviceDirectoryRepository) {}

  async listPeers(principal: Principal): Promise<DevicePeerList> {
    requireScope(principal, 'devices:read');
    return { peers: await this.repository.listPeers(principal.clinicId, principal.deviceId) };
  }
}
