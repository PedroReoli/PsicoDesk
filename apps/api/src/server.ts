import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { S3StorageAdapter } from './adapters/storage/s3-storage.js';
import { PostgresAuthRepository } from './repositories/postgres/auth-repository.js';
import { PostgresBatchRepository } from './repositories/postgres/batch-repository.js';
import { PostgresDatabase } from './repositories/postgres/database.js';
import { PostgresDeviceRegistrationRepository } from './repositories/postgres/device-registration-repository.js';
import { PostgresDeviceDirectoryRepository } from './repositories/postgres/device-directory-repository.js';
import { PostgresHealthRepository } from './repositories/postgres/health-repository.js';
import { PostgresSyncRepository } from './repositories/postgres/sync-repository.js';
import { AuthService } from './services/auth-service.js';
import { BatchService } from './services/batch-service.js';
import { DeviceRegistrationService } from './services/device-registration-service.js';
import { DeviceDirectoryService } from './services/device-directory-service.js';
import { RealtimeHub } from './services/realtime-hub.js';
import { RealtimeTicketService } from './services/realtime-ticket-service.js';
import { SyncService } from './services/sync-service.js';
import { UploadService } from './services/upload-service.js';

const config = loadConfig();
const database = new PostgresDatabase(config.DATABASE_URL);
const authService = new AuthService(
  new PostgresAuthRepository(database),
  config.DEVICE_SECRET_PEPPER,
);
const realtime = new RealtimeHub();
const storage = new S3StorageAdapter({
  region: config.S3_REGION,
  bucket: config.S3_BUCKET,
  ...(config.S3_ENDPOINT ? { endpoint: config.S3_ENDPOINT } : {}),
  accessKeyId: config.S3_ACCESS_KEY_ID,
  secretAccessKey: config.S3_SECRET_ACCESS_KEY,
  forcePathStyle: config.S3_FORCE_PATH_STYLE,
});

const app = await buildApp({
  jwtSecret: config.JWT_SECRET,
  healthRepository: new PostgresHealthRepository(database),
  authService,
  deviceRegistrationService: new DeviceRegistrationService(
    new PostgresDeviceRegistrationRepository(database),
    authService,
    config.DEVICE_SECRET_PEPPER,
  ),
  deviceDirectoryService: new DeviceDirectoryService(
    new PostgresDeviceDirectoryRepository(database),
  ),
  batchService: new BatchService(new PostgresBatchRepository(database)),
  syncService: new SyncService(new PostgresSyncRepository(database)),
  uploadService: new UploadService(storage),
  realtime,
  realtimeTickets: new RealtimeTicketService(),
});

const shutdown = async () => {
  await app.close();
  await database.close();
};
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

await app.listen({ host: config.HOST, port: config.PORT });
