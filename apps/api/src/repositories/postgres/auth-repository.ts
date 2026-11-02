import type { AuthRepository } from '../contracts.js';
import type { DeviceIdentity, Scope } from '../../domain/types.js';
import type { DatabaseClient } from './database.js';

interface DeviceRow {
  clinic_id: string;
  device_id: string;
  secret_hash: string;
  status: 'active' | 'revoked';
  scopes: Scope[];
}

export class PostgresAuthRepository implements AuthRepository {
  constructor(private readonly database: DatabaseClient) {}

  async findDevice(clinicId: string, deviceId: string): Promise<DeviceIdentity | null> {
    const result = await this.database.query<DeviceRow>(
      `SELECT clinic_id, id AS device_id, secret_hash, status, scopes
       FROM devices WHERE clinic_id = $1 AND id = $2`,
      [clinicId, deviceId],
    );
    const row = result.rows[0];
    return row
      ? {
          clinicId: row.clinic_id,
          deviceId: row.device_id,
          secretHash: row.secret_hash,
          status: row.status,
          scopes: row.scopes,
        }
      : null;
  }

  async touchDevice(clinicId: string, deviceId: string): Promise<void> {
    await this.database.query(
      'UPDATE devices SET last_seen_at = now() WHERE clinic_id = $1 AND id = $2',
      [clinicId, deviceId],
    );
  }
}
