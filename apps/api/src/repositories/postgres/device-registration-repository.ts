import type { DeviceRegistrationRepository } from '../contracts.js';
import type { Scope } from '../../domain/types.js';
import type { PostgresDatabase } from './database.js';

export class PostgresDeviceRegistrationRepository implements DeviceRegistrationRepository {
  constructor(private readonly database: PostgresDatabase) {}

  async consumeEnrollmentAndCreateDevice(input: {
    clinicId: string;
    enrollmentTokenHash: string;
    deviceId: string;
    deviceName: string;
    deviceSecretHash: string;
    signingPublicKey: string;
    signingKeyFingerprint: string;
    createdAt: string;
  }): Promise<{ scopes: readonly Scope[] } | null> {
    return this.database.transaction(async (client) => {
      const enrollment = await client.query<{ id: string; scopes: Scope[] }>(
        `SELECT id,scopes FROM device_enrollments
         WHERE clinic_id=$1 AND token_hash=$2 AND consumed_at IS NULL AND expires_at>$3
         FOR UPDATE`,
        [input.clinicId, input.enrollmentTokenHash, input.createdAt],
      );
      const row = enrollment.rows[0];
      if (!row) return null;
      const consumed = await client.query(
        `UPDATE device_enrollments SET consumed_at=$3
         WHERE clinic_id=$1 AND id=$2 AND consumed_at IS NULL`,
        [input.clinicId, row.id, input.createdAt],
      );
      if (consumed.rowCount !== 1) return null;
      await client.query(
        `INSERT INTO devices(clinic_id,id,name,secret_hash,scopes,status,created_at,signing_public_key,signing_key_fingerprint)
         VALUES ($1,$2,$3,$4,$5,'active',$6,$7,$8)`,
        [
          input.clinicId,
          input.deviceId,
          input.deviceName,
          input.deviceSecretHash,
          row.scopes,
          input.createdAt,
          input.signingPublicKey,
          input.signingKeyFingerprint,
        ],
      );
      return { scopes: row.scopes };
    });
  }
}
