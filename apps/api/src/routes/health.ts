import type { FastifyPluginAsync } from 'fastify';
import type { HealthRepository } from '../repositories/contracts.js';

export function healthRoutes(repository: HealthRepository): FastifyPluginAsync {
  return async (app) => {
    app.get(
      '/health',
      {
        schema: {
          tags: ['system'],
          summary: 'Liveness',
          response: { 200: { type: 'object', properties: { status: { const: 'ok' } } } },
        },
      },
      async () => ({ status: 'ok' as const }),
    );
    app.get(
      '/ready',
      {
        schema: {
          tags: ['system'],
          summary: 'Readiness',
          response: {
            200: { type: 'object', properties: { status: { const: 'ready' } } },
            503: { type: 'object', properties: { status: { const: 'unavailable' } } },
          },
        },
      },
      async (_request, reply) => {
        try {
          return (await repository.ping())
            ? { status: 'ready' as const }
            : reply.code(503).send({ status: 'unavailable' as const });
        } catch {
          return reply.code(503).send({ status: 'unavailable' as const });
        }
      },
    );
  };
}
