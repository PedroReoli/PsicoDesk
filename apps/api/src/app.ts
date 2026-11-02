import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import { ZodError } from 'zod';
import { AppError } from './domain/errors.js';
import { authPlugin } from './plugins/auth.js';
import type { HealthRepository } from './repositories/contracts.js';
import { authRoutes } from './routes/auth.js';
import { batchRoutes } from './routes/batches.js';
import { healthRoutes } from './routes/health.js';
import { realtimeRoutes } from './routes/realtime.js';
import { syncRoutes } from './routes/sync.js';
import { uploadRoutes } from './routes/uploads.js';
import type { AuthService } from './services/auth-service.js';
import type { BatchService } from './services/batch-service.js';
import type { DeviceRegistrationService } from './services/device-registration-service.js';
import type { DeviceDirectoryService } from './services/device-directory-service.js';
import type { RealtimeHub } from './services/realtime-hub.js';
import type { RealtimeTicketService } from './services/realtime-ticket-service.js';
import type { SyncService } from './services/sync-service.js';
import type { UploadService } from './services/upload-service.js';

export interface AppDependencies {
  jwtSecret: string;
  healthRepository: HealthRepository;
  authService: AuthService;
  deviceRegistrationService: DeviceRegistrationService;
  deviceDirectoryService: DeviceDirectoryService;
  batchService: BatchService;
  syncService: SyncService;
  uploadService: UploadService;
  realtime: RealtimeHub;
  realtimeTickets: RealtimeTicketService;
  logger?: FastifyBaseLogger | boolean;
}

export async function buildApp(dependencies: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: dependencies.logger ?? {
      level: 'info',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.deviceSecret',
          'req.body.payloadBase64',
          'req.body.payloadCiphertext',
          "res.headers['set-cookie']",
        ],
        censor: '[REDACTED]',
      },
    },
    genReqId: () => randomUUID(),
    bodyLimit: 28 * 1024 * 1024,
    trustProxy: false,
  });

  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip ?? 'unknown-client',
  });
  await app.register(swagger, {
    openapi: {
      info: { title: 'PsicoDesk Sync API', version: '0.1.0' },
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/documentation' });
  await app.register(websocket, { options: { maxPayload: 1_024, perMessageDeflate: false } });
  await app.register(authPlugin, {
    jwtSecret: dependencies.jwtSecret,
    authService: dependencies.authService,
  });

  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;
    if (error instanceof ZodError) {
      return reply
        .code(400)
        .send({ error: 'INVALID_INPUT', message: 'Entrada inválida.', requestId });
    }
    if (error instanceof AppError) {
      return reply
        .code(error.statusCode)
        .send({ error: error.code, message: error.message, requestId });
    }
    if (typeof error === 'object' && error !== null && 'validation' in error) {
      return reply
        .code(400)
        .send({ error: 'INVALID_INPUT', message: 'Entrada inválida.', requestId });
    }
    const internalError = error instanceof Error ? error : new Error('Unknown request failure');
    request.log.error(
      {
        errorName: internalError.name,
        errorCode: 'code' in internalError ? internalError.code : undefined,
        requestId,
      },
      'request failed',
    );
    return reply.code(500).send({ error: 'INTERNAL_ERROR', message: 'Falha interna.', requestId });
  });

  await app.register(healthRoutes(dependencies.healthRepository));
  await app.register(
    authRoutes(
      dependencies.authService,
      dependencies.deviceRegistrationService,
      dependencies.deviceDirectoryService,
    ),
  );
  await app.register(batchRoutes(dependencies.batchService, dependencies.realtime));
  await app.register(syncRoutes(dependencies.syncService, dependencies.realtime));
  await app.register(uploadRoutes(dependencies.uploadService));
  await app.register(realtimeRoutes(dependencies.realtime, dependencies.realtimeTickets));
  await app.ready();
  return app;
}
