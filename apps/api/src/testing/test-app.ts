import { Buffer } from 'node:buffer';
import type { FastifyBaseLogger } from 'fastify';
import { buildApp } from '../app.js';
import type { Scope } from '../domain/types.js';
import { AuthService } from '../services/auth-service.js';
import { BatchService } from '../services/batch-service.js';
import { DeviceDirectoryService } from '../services/device-directory-service.js';
import { DeviceRegistrationService } from '../services/device-registration-service.js';
import { RealtimeHub } from '../services/realtime-hub.js';
import { RealtimeTicketService } from '../services/realtime-ticket-service.js';
import { SyncService } from '../services/sync-service.js';
import { UploadService } from '../services/upload-service.js';
import {
  DeterministicStorage,
  MemoryBatchRepository,
  MemoryIdentityRepository,
  MemorySyncRepository,
  ToggleHealthRepository,
} from './fakes.js';

export const deterministicFixture = {
  clinicId: '10000000-0000-4000-8000-000000000001',
  otherClinicId: '10000000-0000-4000-8000-000000000002',
  senderDeviceId: '20000000-0000-4000-8000-000000000001',
  receiverDeviceId: '20000000-0000-4000-8000-000000000002',
  otherDeviceId: '20000000-0000-4000-8000-000000000003',
  registeredDeviceId: '20000000-0000-4000-8000-000000000004',
  deviceSecret: 'deterministic-device-secret-0000000000000001',
  registeredDeviceSecret: 'deterministic-registered-secret-000000000001',
  enrollmentToken: 'deterministic-enrollment-token-0000000000001',
  senderPublicKey: Buffer.alloc(32, 1).toString('base64'),
  receiverPublicKey: Buffer.alloc(32, 2).toString('base64'),
  otherPublicKey: Buffer.alloc(32, 3).toString('base64'),
  now: '2030-01-01T00:00:00.000Z',
} as const;

const allScopes: readonly Scope[] = [
  'batches:read',
  'batches:write',
  'sync:read',
  'sync:write',
  'uploads:write',
  'realtime:connect',
  'devices:read',
];

export async function buildDeterministicTestApp(
  options: {
    logger?: FastifyBaseLogger | boolean;
  } = {},
) {
  const identities = new MemoryIdentityRepository();
  const authService = new AuthService(
    identities,
    'deterministic-pepper-with-at-least-32-characters',
  );
  const seedDevice = (
    clinicId: string,
    deviceId: string,
    name: string,
    signingPublicKey: string,
  ) => {
    const fingerprint = AuthService.fingerprintSigningKey(signingPublicKey);
    identities.seedDevice({
      clinicId,
      deviceId,
      name,
      secretHash: authService.hashSecret(deterministicFixture.deviceSecret),
      status: 'active',
      scopes: allScopes,
      signingPublicKey,
      signingKeyFingerprint: fingerprint,
    });
  };
  seedDevice(
    deterministicFixture.clinicId,
    deterministicFixture.senderDeviceId,
    'Desktop sender',
    deterministicFixture.senderPublicKey,
  );
  seedDevice(
    deterministicFixture.clinicId,
    deterministicFixture.receiverDeviceId,
    'Mobile receiver',
    deterministicFixture.receiverPublicKey,
  );
  seedDevice(
    deterministicFixture.otherClinicId,
    deterministicFixture.otherDeviceId,
    'Other tenant',
    deterministicFixture.otherPublicKey,
  );

  const registrationService = new DeviceRegistrationService(
    identities,
    authService,
    'deterministic-pepper-with-at-least-32-characters',
    {
      deviceId: () => deterministicFixture.registeredDeviceId,
      deviceSecret: () => deterministicFixture.registeredDeviceSecret,
      now: () => new Date(deterministicFixture.now),
    },
  );
  identities.seedEnrollment(
    deterministicFixture.clinicId,
    registrationService.hashEnrollmentToken(deterministicFixture.enrollmentToken),
    allScopes,
  );

  let ticketSequence = 0;
  const realtimeTickets = new RealtimeTicketService(60_000, {
    ticket: () => `deterministic-realtime-ticket-${String(++ticketSequence).padStart(8, '0')}`,
    now: () => new Date(deterministicFixture.now).getTime(),
  });
  const health = new ToggleHealthRepository();
  const batches = new MemoryBatchRepository();
  batches.seedTarget(deterministicFixture.clinicId, deterministicFixture.senderDeviceId);
  batches.seedTarget(deterministicFixture.clinicId, deterministicFixture.receiverDeviceId);
  batches.seedTarget(deterministicFixture.otherClinicId, deterministicFixture.otherDeviceId);
  const sync = new MemorySyncRepository();
  const realtime = new RealtimeHub();
  const app = await buildApp({
    jwtSecret: 'deterministic-jwt-secret-with-at-least-32-characters',
    healthRepository: health,
    authService,
    deviceRegistrationService: registrationService,
    deviceDirectoryService: new DeviceDirectoryService(identities),
    batchService: new BatchService(batches, () => new Date(deterministicFixture.now).getTime()),
    syncService: new SyncService(sync),
    uploadService: new UploadService(new DeterministicStorage()),
    realtime,
    realtimeTickets,
    logger: options.logger ?? false,
  });
  return {
    app,
    fixture: deterministicFixture,
    repositories: { identities, batches, sync, health },
  };
}

export async function startDeterministicTestServer() {
  const built = await buildDeterministicTestApp();
  await built.app.listen({ host: '127.0.0.1', port: 0 });
  return {
    ...built,
    baseUrl: built.app.listeningOrigin,
    close: () => built.app.close(),
  };
}
