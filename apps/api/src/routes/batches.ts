import type { FastifyPluginAsync } from 'fastify';
import {
  acknowledgeBatchSchema,
  batchListQuerySchema,
  createBatchSchema,
} from '@psicodesk/sync-protocol';
import { z } from 'zod';
import { errors } from '../domain/errors.js';
import type { BatchService } from '../services/batch-service.js';
import type { RealtimeHub } from '../services/realtime-hub.js';
import {
  batchListJsonSchema,
  batchMetadataJsonSchema,
  createBatchJsonSchema,
  securedResponses,
  uuidParameterSchema,
} from './schemas.js';

const paramsSchema = z.object({ id: z.uuid() });

export function batchRoutes(service: BatchService, realtime: RealtimeHub): FastifyPluginAsync {
  return async (app) => {
    app.get(
      '/v1/batches',
      {
        preValidation: [app.authenticate],
        schema: {
          tags: ['batches'],
          summary: 'Listar cargas cifradas destinadas ao dispositivo autenticado',
          security: [{ bearerAuth: [] }],
          querystring: {
            type: 'object',
            additionalProperties: false,
            properties: {
              cursor: { type: 'string', pattern: '^\\d+$', default: '0' },
              limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
              status: { type: 'string', enum: ['pending', 'downloaded'] },
            },
          },
          response: { 200: batchListJsonSchema, ...securedResponses },
        },
      },
      async (request) => service.list(request.principal, batchListQuerySchema.parse(request.query)),
    );

    app.post(
      '/v1/batches',
      {
        preValidation: [app.authenticate],
        config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
        schema: {
          tags: ['batches'],
          summary: 'Enviar carga cifrada idempotente',
          security: [{ bearerAuth: [] }],
          headers: {
            type: 'object',
            required: ['idempotency-key'],
            properties: { 'idempotency-key': { type: 'string', minLength: 16, maxLength: 128 } },
          },
          body: createBatchJsonSchema,
          response: {
            201: batchMetadataJsonSchema,
            200: batchMetadataJsonSchema,
            ...securedResponses,
          },
        },
      },
      async (request, reply) => {
        const key = request.headers['idempotency-key'];
        if (typeof key !== 'string')
          throw errors.badRequest('Cabeçalho Idempotency-Key obrigatório.');
        const result = await service.create(
          request.principal,
          key,
          createBatchSchema.parse(request.body),
        );
        realtime.publish(
          request.principal.clinicId,
          { type: 'batch.available', batchId: result.batch.batchId },
          request.principal.deviceId,
        );
        return reply.code(result.created ? 201 : 200).send(result.batch);
      },
    );

    app.get(
      '/v1/batches/:id',
      {
        preValidation: [app.authenticate],
        schema: {
          tags: ['batches'],
          summary: 'Consultar metadados da carga',
          security: [{ bearerAuth: [] }],
          params: uuidParameterSchema,
          response: { 200: batchMetadataJsonSchema, ...securedResponses },
        },
      },
      async (request) => service.metadata(request.principal, paramsSchema.parse(request.params).id),
    );
    app.get(
      '/v1/batches/:id/payload',
      {
        preValidation: [app.authenticate],
        schema: {
          tags: ['batches'],
          summary: 'Baixar carga cifrada destinada ao dispositivo',
          security: [{ bearerAuth: [] }],
          params: uuidParameterSchema,
          response: {
            200: {
              type: 'object',
              required: ['payloadBase64', 'contentHash'],
              properties: { payloadBase64: { type: 'string' }, contentHash: { type: 'string' } },
            },
            ...securedResponses,
          },
        },
      },
      async (request) => service.payload(request.principal, paramsSchema.parse(request.params).id),
    );
    app.post(
      '/v1/batches/:id/ack',
      {
        preValidation: [app.authenticate],
        schema: {
          tags: ['batches'],
          summary: 'Confirmar importação',
          security: [{ bearerAuth: [] }],
          params: uuidParameterSchema,
          body: {
            type: 'object',
            required: ['status', 'importedAt'],
            additionalProperties: false,
            properties: {
              status: { type: 'string', enum: ['applied', 'rejected'] },
              importedAt: { type: 'string', format: 'date-time' },
              resultHash: { type: 'string' },
            },
          },
          response: { 200: batchMetadataJsonSchema, ...securedResponses },
        },
      },
      async (request) =>
        service.acknowledge(
          request.principal,
          paramsSchema.parse(request.params).id,
          acknowledgeBatchSchema.parse(request.body),
        ),
    );
    app.delete(
      '/v1/batches/:id',
      {
        preValidation: [app.authenticate],
        schema: {
          tags: ['batches'],
          summary: 'Remover carga de forma lógica',
          security: [{ bearerAuth: [] }],
          params: uuidParameterSchema,
          response: { 204: { type: 'null' }, ...securedResponses },
        },
      },
      async (request, reply) => {
        await service.remove(request.principal, paramsSchema.parse(request.params).id);
        return reply.code(204).send();
      },
    );
  };
}
