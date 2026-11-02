import type { FastifyPluginAsync } from 'fastify';
import { cursorSchema, syncPushSchema } from '@psicodesk/sync-protocol';
import { z } from 'zod';
import type { RealtimeHub } from '../services/realtime-hub.js';
import type { SyncService } from '../services/sync-service.js';
import { securedResponses } from './schemas.js';

const pullQuerySchema = z.object({
  cursor: cursorSchema,
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export function syncRoutes(service: SyncService, realtime: RealtimeHub): FastifyPluginAsync {
  return async (app) => {
    app.post(
      '/v1/sync/push',
      {
        preValidation: [app.authenticate],
        schema: {
          tags: ['sync'],
          summary: 'Enviar alterações cifradas com controle de revisão',
          security: [{ bearerAuth: [] }],
          response: { 200: { type: 'object' }, ...securedResponses },
        },
      },
      async (request) => {
        const result = await service.push(request.principal, syncPushSchema.parse(request.body));
        if (result.acceptedChangeIds.length > 0)
          realtime.publish(
            request.principal.clinicId,
            { type: 'sync.available', cursor: result.cursor },
            request.principal.deviceId,
          );
        return result;
      },
    );
    app.get(
      '/v1/sync/pull',
      {
        preValidation: [app.authenticate],
        schema: {
          tags: ['sync'],
          summary: 'Receber alterações cifradas após cursor',
          security: [{ bearerAuth: [] }],
          querystring: {
            type: 'object',
            properties: {
              cursor: { type: 'string', pattern: '^\\d+$', default: '0' },
              limit: { type: 'integer', minimum: 1, maximum: 500, default: 200 },
            },
          },
          response: { 200: { type: 'object' }, ...securedResponses },
        },
      },
      async (request) => {
        const query = pullQuerySchema.parse(request.query);
        return service.pull(request.principal, query.cursor, query.limit);
      },
    );
  };
}
