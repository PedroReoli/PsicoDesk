import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { UploadService } from '../services/upload-service.js';
import { securedResponses } from './schemas.js';

const uploadInputSchema = z.object({
  fileName: z.string().min(1).max(180),
  mimeType: z.string().min(3).max(120),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(20 * 1024 * 1024),
  purpose: z.enum(['document', 'attachment', 'backup']),
});

export function uploadRoutes(service: UploadService): FastifyPluginAsync {
  return async (app) => {
    app.post(
      '/v1/uploads/presign',
      {
        preValidation: [app.authenticate],
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
        schema: {
          tags: ['uploads'],
          summary: 'Gerar URL curta para upload privado',
          security: [{ bearerAuth: [] }],
          response: {
            200: {
              type: 'object',
              required: ['key', 'url', 'expiresAt', 'requiredHeaders'],
              properties: {
                key: { type: 'string' },
                url: { type: 'string' },
                expiresAt: { type: 'string', format: 'date-time' },
                requiredHeaders: { type: 'object', additionalProperties: { type: 'string' } },
              },
            },
            ...securedResponses,
          },
        },
      },
      async (request) => service.presign(request.principal, uploadInputSchema.parse(request.body)),
    );
  };
}
