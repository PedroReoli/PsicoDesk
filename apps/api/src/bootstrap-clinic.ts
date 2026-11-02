import { createHash, createHmac } from 'node:crypto';
import { z } from 'zod';
import { PostgresDatabase } from './repositories/postgres/database.js';
import { AuthService } from './services/auth-service.js';

const bootstrapSchema = z.object({
  DATABASE_URL: z.url(),
  DEVICE_SECRET_PEPPER: z.string().min(32),
  BOOTSTRAP_CLINIC_ID: z.uuid(),
  BOOTSTRAP_CLINIC_NAME: z.string().min(2).max(160),
  BOOTSTRAP_DEVICE_ID: z.uuid(),
  BOOTSTRAP_DEVICE_NAME: z.string().min(1).max(120),
  BOOTSTRAP_DEVICE_SECRET: z.string().min(32).max(512),
  BOOTSTRAP_SIGNING_PUBLIC_KEY: z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
  BOOTSTRAP_ENROLLMENT_TOKEN: z.string().min(32).max(512),
  BOOTSTRAP_ENROLLMENT_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
});

const input = bootstrapSchema.parse(process.env);
const database = new PostgresDatabase(input.DATABASE_URL);
const authService = new AuthService(
  { findDevice: async () => null, touchDevice: async () => undefined },
  input.DEVICE_SECRET_PEPPER,
);
const signingKeyFingerprint = createHash('sha256')
  .update(Buffer.from(input.BOOTSTRAP_SIGNING_PUBLIC_KEY, 'base64'))
  .digest('hex');
const enrollmentTokenHash = createHmac('sha256', input.DEVICE_SECRET_PEPPER)
  .update(`enrollment:${input.BOOTSTRAP_ENROLLMENT_TOKEN}`, 'utf8')
  .digest('hex');
const scopes = [
  'batches:read',
  'batches:write',
  'sync:read',
  'sync:write',
  'uploads:write',
  'realtime:connect',
  'devices:read',
];

try {
  await database.transaction(async (client) => {
    await client.query(
      `INSERT INTO clinics(id,name,status) VALUES ($1,$2,'active')
       ON CONFLICT (id) DO UPDATE SET name=excluded.name`,
      [input.BOOTSTRAP_CLINIC_ID, input.BOOTSTRAP_CLINIC_NAME],
    );
    const existing = await client.query<{
      secret_hash: string;
      signing_key_fingerprint: string | null;
    }>(
      'SELECT secret_hash,signing_key_fingerprint FROM devices WHERE clinic_id=$1 AND id=$2 FOR UPDATE',
      [input.BOOTSTRAP_CLINIC_ID, input.BOOTSTRAP_DEVICE_ID],
    );
    const secretHash = authService.hashSecret(input.BOOTSTRAP_DEVICE_SECRET);
    if (
      existing.rows[0] &&
      (existing.rows[0].secret_hash !== secretHash ||
        existing.rows[0].signing_key_fingerprint !== signingKeyFingerprint)
    ) {
      throw new Error('O dispositivo bootstrap já existe com credenciais diferentes.');
    }
    await client.query(
      `INSERT INTO devices(
         clinic_id,id,name,secret_hash,scopes,status,signing_public_key,signing_key_fingerprint
       ) VALUES ($1,$2,$3,$4,$5,'active',$6,$7)
       ON CONFLICT (clinic_id,id) DO UPDATE SET name=excluded.name,status='active'`,
      [
        input.BOOTSTRAP_CLINIC_ID,
        input.BOOTSTRAP_DEVICE_ID,
        input.BOOTSTRAP_DEVICE_NAME,
        secretHash,
        scopes,
        input.BOOTSTRAP_SIGNING_PUBLIC_KEY,
        signingKeyFingerprint,
      ],
    );
    await client.query(
      `INSERT INTO device_enrollments(clinic_id,token_hash,scopes,expires_at)
       VALUES ($1,$2,$3,now()+($4::text || ' hours')::interval)
       ON CONFLICT (clinic_id,token_hash) DO NOTHING`,
      [
        input.BOOTSTRAP_CLINIC_ID,
        enrollmentTokenHash,
        scopes,
        input.BOOTSTRAP_ENROLLMENT_TTL_HOURS,
      ],
    );
  });
  process.stdout.write(
    `Clínica ${input.BOOTSTRAP_CLINIC_ID} e dispositivo ${input.BOOTSTRAP_DEVICE_ID} provisionados.\n`,
  );
  process.stdout.write(
    'O enrollment token não é exibido; entregue o valor original por canal seguro.\n',
  );
} finally {
  await database.close();
}
