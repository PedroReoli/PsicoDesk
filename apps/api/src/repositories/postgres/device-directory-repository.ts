import type { DevicePeer } from '@psicodesk/sync-protocol';
import type { DeviceDirectoryRepository } from '../contracts.js';
import type { DatabaseClient } from './database.js';

export class PostgresDeviceDirectoryRepository implements DeviceDirectoryRepository {
  constructor(private readonly database: DatabaseClient) {}

  async listPeers(clinicId: string, deviceId: string): Promise<DevicePeer[]> {
    const result = await this.database.query<{
      device_id: string;
      name: string;
      signing_public_key: string;
      signing_key_fingerprint: string;
    }>(
      `SELECT id AS device_id,name,signing_public_key,signing_key_fingerprint
       FROM devices
       WHERE clinic_id=$1 AND id<>$2 AND status='active' AND signing_public_key IS NOT NULL
       ORDER BY name,id`,
      [clinicId, deviceId],
    );
    return result.rows.map((row) => ({
      deviceId: row.device_id,
      name: row.name,
      signingPublicKey: row.signing_public_key,
      signingKeyFingerprint: row.signing_key_fingerprint,
    }));
  }
}
