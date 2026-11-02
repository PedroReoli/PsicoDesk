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

export const encryptionMetadataJsonSchema = {
  type: 'object',
  required: ['algorithm', 'keyId', 'nonce'],
  additionalProperties: false,
  properties: {
    algorithm: { const: 'aes-256-gcm' },
    keyId: { type: 'string' },
    nonce: { type: 'string' },
  },
} as const;

export const batchMetadataJsonSchema = {
  type: 'object',
  required: [
    'clinicId',
    'deliveryCursor',
    'schemaVersion',
    'batchId',
    'originDeviceId',
    'targetDeviceId',
    'createdAt',
    'expiresAt',
    'contentHash',
    'signerPublicKey',
    'signature',
    'encryption',
    'status',
    'receivedAt',
    'acknowledgedAt',
  ],
  additionalProperties: false,
  properties: {
    clinicId: { type: 'string', format: 'uuid' },
    deliveryCursor: { type: 'string', pattern: '^\\d+$' },
    schemaVersion: { type: 'integer' },
    batchId: { type: 'string', format: 'uuid' },
    originDeviceId: { type: 'string', format: 'uuid' },
    targetDeviceId: { type: 'string', format: 'uuid' },
    createdAt: { type: 'string', format: 'date-time' },
    expiresAt: { type: 'string', format: 'date-time' },
    contentHash: { type: 'string' },
    signerPublicKey: { type: 'string' },
    signature: { type: 'string' },
    encryption: encryptionMetadataJsonSchema,
    status: {
      type: 'string',
      enum: ['pending', 'downloaded', 'applied', 'rejected', 'deleted', 'expired'],
    },
    receivedAt: { type: 'string', format: 'date-time' },
    acknowledgedAt: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] },
  },
} as const;

export const batchListJsonSchema = {
  type: 'object',
  required: ['items', 'nextCursor', 'hasMore'],
  additionalProperties: false,
  properties: {
    items: { type: 'array', items: batchMetadataJsonSchema },
    nextCursor: { type: 'string', pattern: '^\\d+$' },
    hasMore: { type: 'boolean' },
  },
} as const;

export const createBatchJsonSchema = {
  type: 'object',
  required: [
    'schemaVersion',
    'batchId',
    'originDeviceId',
    'targetDeviceId',
    'createdAt',
    'expiresAt',
    'contentHash',
    'signerPublicKey',
    'signature',
    'encryption',
    'payloadBase64',
  ],
  additionalProperties: false,
  properties: {
    schemaVersion: { const: 1 },
    batchId: { type: 'string', format: 'uuid' },
    originDeviceId: { type: 'string', format: 'uuid' },
    targetDeviceId: { type: 'string', format: 'uuid' },
    createdAt: { type: 'string', format: 'date-time' },
    expiresAt: { type: 'string', format: 'date-time' },
    contentHash: { type: 'string', pattern: '^[a-fA-F0-9]{64}$' },
    signerPublicKey: { type: 'string', pattern: '^[A-Za-z0-9+/]{43}=$' },
    signature: { type: 'string', pattern: '^[A-Za-z0-9+/]{86}==$' },
    encryption: encryptionMetadataJsonSchema,
    payloadBase64: { type: 'string' },
  },
} as const;
