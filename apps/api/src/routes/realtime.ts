import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { RealtimeHub } from '../services/realtime-hub.js';
import type { RealtimeTicketService } from '../services/realtime-ticket-service.js';
import { requireScope } from '../services/batch-service.js';
import { securedResponses } from './schemas.js';

const ticketQuerySchema = z.object({ ticket: z.string().min(32).max(512) });

export function realtimeRoutes(
  hub: RealtimeHub,
  ticketService: RealtimeTicketService,
): FastifyPluginAsync {
  return async (app) => {
    app.post(
      '/v1/realtime/ticket',
      {
        preValidation: [app.authenticate],
        config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
        schema: {
          tags: ['realtime'],
          summary: 'Emitir ticket WebSocket efêmero e de uso único',
          security: [{ bearerAuth: [] }],
          response: {
            200: {
              type: 'object',
              required: ['ticket', 'expiresAt'],
              properties: {
                ticket: { type: 'string' },
                expiresAt: { type: 'string', format: 'date-time' },
              },
            },
            ...securedResponses,
          },
        },
      },
      async (request) => ticketService.issue(request.principal),
    );

    app.get(
      '/v1/realtime',
      {
        websocket: true,
        preValidation: [
          async (request) => {
            request.principal = ticketService.consume(
              ticketQuerySchema.parse(request.query).ticket,
            );
          },
        ],
        schema: {
          hide: true,
          querystring: {
            type: 'object',
            required: ['ticket'],
            additionalProperties: false,
            properties: { ticket: { type: 'string', minLength: 32, maxLength: 512 } },
          },
        },
      },
      (socket, request) => {
        requireScope(request.principal, 'realtime:connect');
        const disconnect = hub.connect(
          request.principal.clinicId,
          request.principal.deviceId,
          socket,
        );
        socket.on('message', (data) => {
          const byteLength = Array.isArray(data)
            ? data.reduce((total, fragment) => total + fragment.byteLength, 0)
            : data.byteLength;
          if (byteLength > 1_024) {
            socket.close(1009, 'message too large');
            return;
          }
          try {
            const message = JSON.parse(data.toString()) as { type?: unknown };
            if (message.type === 'ping')
              socket.send(JSON.stringify({ type: 'pong', at: new Date().toISOString() }));
            else socket.close(1003, 'unsupported event');
          } catch {
            socket.close(1007, 'invalid json');
          }
        });
        socket.once('close', disconnect);
        socket.once('error', disconnect);
      },
    );
  };
}
