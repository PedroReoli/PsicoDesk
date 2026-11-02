import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AuthService } from '../services/auth-service.js';
import { errorResponseSchema } from './schemas.js';

const tokenInputSchema = z.object({
  clinicId: z.uuid(),
  deviceId: z.uuid(),
  deviceSecret: z.string().min(32).max(512),
});

export function authRoutes(authService: AuthService): FastifyPluginAsync {
  return async (app) => {
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
              required: ['accessToken', 'expiresIn'],
              properties: { accessToken: { type: 'string' }, expiresIn: { type: 'integer' } },
            },
            401: errorResponseSchema,
            429: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const input = tokenInputSchema.parse(request.body);
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
        return { accessToken, expiresIn: 900 };
      },
    );
  };
}
