import type { FastifyPluginAsync } from 'fastify';
import { deviceTokenInputSchema, registerDeviceInputSchema } from '@psicodesk/sync-protocol';
import type { AuthService } from '../services/auth-service.js';
import type { DeviceRegistrationService } from '../services/device-registration-service.js';
import type { DeviceDirectoryService } from '../services/device-directory-service.js';
import { errorResponseSchema } from './schemas.js';

export function authRoutes(
  authService: AuthService,
  registrationService: DeviceRegistrationService,
  directoryService: DeviceDirectoryService,
): FastifyPluginAsync {
  return async (app) => {
    app.post(
      '/v1/devices/register',
      {
        config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
        schema: {
          tags: ['auth'],
          summary: 'Registrar dispositivo com código de provisionamento de uso único',
          body: {
            type: 'object',
            required: ['clinicId', 'enrollmentToken', 'deviceName', 'signingPublicKey'],
            additionalProperties: false,
            properties: {
              clinicId: { type: 'string', format: 'uuid' },
              enrollmentToken: { type: 'string', minLength: 32, maxLength: 512 },
              deviceName: { type: 'string', minLength: 1, maxLength: 120 },
              signingPublicKey: { type: 'string', pattern: '^[A-Za-z0-9+/]{43}=$' },
            },
          },
          response: {
            201: {
              type: 'object',
              required: [
                'clinicId',
                'deviceId',
                'deviceSecret',
                'scopes',
                'signingPublicKey',
                'signingKeyFingerprint',
                'createdAt',
              ],
              properties: {
                clinicId: { type: 'string', format: 'uuid' },
                deviceId: { type: 'string', format: 'uuid' },
                deviceSecret: { type: 'string' },
                scopes: { type: 'array', items: { type: 'string' } },
                signingPublicKey: { type: 'string' },
                signingKeyFingerprint: { type: 'string' },
                createdAt: { type: 'string', format: 'date-time' },
              },
            },
            400: errorResponseSchema,
            401: errorResponseSchema,
            429: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const registered = await registrationService.register(
          registerDeviceInputSchema.parse(request.body),
        );
        return reply.code(201).send(registered);
      },
    );

    app.get(
      '/v1/devices/peers',
      {
        preValidation: [app.authenticate],
        schema: {
          tags: ['auth'],
          summary: 'Listar identidades públicas dos peers ativos da clínica',
          security: [{ bearerAuth: [] }],
          response: {
            200: {
              type: 'object',
              required: ['peers'],
              properties: {
                peers: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['deviceId', 'name', 'signingPublicKey', 'signingKeyFingerprint'],
                    properties: {
                      deviceId: { type: 'string', format: 'uuid' },
                      name: { type: 'string' },
                      signingPublicKey: { type: 'string' },
                      signingKeyFingerprint: { type: 'string' },
                    },
                  },
                },
              },
            },
            401: errorResponseSchema,
            403: errorResponseSchema,
          },
        },
      },
      async (request) => directoryService.listPeers(request.principal),
    );

    app.post(
      '/v1/auth/token',
      {
        config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
        schema: {
          tags: ['auth'],
          summary: 'Emitir token curto para dispositivo',
          body: {
            type: 'object',
            required: ['clinicId', 'deviceId', 'deviceSecret'],
            additionalProperties: false,
            properties: {
              clinicId: { type: 'string', format: 'uuid' },
              deviceId: { type: 'string', format: 'uuid' },
              deviceSecret: { type: 'string', minLength: 32, maxLength: 512 },
            },
          },
          response: {
            200: {
              type: 'object',
              required: ['accessToken', 'tokenType', 'expiresIn'],
              properties: {
                accessToken: { type: 'string' },
                tokenType: { const: 'Bearer' },
                expiresIn: { type: 'integer' },
              },
            },
            401: errorResponseSchema,
            429: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const input = deviceTokenInputSchema.parse(request.body);
        const device = await authService.authenticateDevice(
          input.clinicId,
          input.deviceId,
          input.deviceSecret,
        );
        const accessToken = app.jwt.sign(
          {
            sub: device.deviceId,
            clinicId: device.clinicId,
            deviceId: device.deviceId,
            tokenType: 'device',
          },
          { expiresIn: '15m' },
        );
        return { accessToken, tokenType: 'Bearer' as const, expiresIn: 900 };
      },
    );
  };
}
