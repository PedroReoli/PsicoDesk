export const errorResponseSchema = {
  type: 'object',
  required: ['error', 'message', 'requestId'],
  additionalProperties: false,
  properties: {
    error: { type: 'string' },
    message: { type: 'string' },
    requestId: { type: 'string' },
  },
} as const;

export const uuidParameterSchema = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: { id: { type: 'string', format: 'uuid' } },
} as const;

export const securedResponses = {
  400: { description: 'Entrada inválida', ...errorResponseSchema },
  401: { description: 'Não autenticado', ...errorResponseSchema },
  403: { description: 'Sem permissão', ...errorResponseSchema },
  404: { description: 'Não encontrado', ...errorResponseSchema },
  409: { description: 'Conflito', ...errorResponseSchema },
  429: { description: 'Limite excedido', ...errorResponseSchema },
  500: { description: 'Falha interna', ...errorResponseSchema },
} as const;
