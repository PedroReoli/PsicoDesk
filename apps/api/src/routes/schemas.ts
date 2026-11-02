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

export const syncChangeJsonSchema = {
  type: 'object',
  required: [
    'changeId',
    'entityType',
    'entityId',
    'operation',
    'modifiedAt',
    'encryption',
    'payloadCiphertext',
    'payloadHash',
    'cursor',
    'revision',
    'sourceDeviceId',
  ],
  additionalProperties: false,
  properties: {
    changeId: { type: 'string', format: 'uuid' },
    entityType: { type: 'string' },
    entityId: { type: 'string', format: 'uuid' },
    operation: { type: 'string', enum: ['upsert', 'delete'] },
    modifiedAt: { type: 'string', format: 'date-time' },
    encryption: encryptionMetadataJsonSchema,
    payloadCiphertext: { type: 'string' },
    payloadHash: { type: 'string' },
    cursor: { type: 'string', pattern: '^\\d+$' },
    revision: { type: 'integer' },
    sourceDeviceId: { type: 'string', format: 'uuid' },
  },
} as const;

export const syncConflictJsonSchema = {
  type: 'object',
  required: [
    'conflictId',
    'entityType',
    'entityId',
    'incomingChangeId',
    'expectedRevision',
    'currentRevision',
    'createdAt',
  ],
  additionalProperties: false,
  properties: {
    conflictId: { type: 'string', format: 'uuid' },
    entityType: { type: 'string' },
    entityId: { type: 'string', format: 'uuid' },
    incomingChangeId: { type: 'string', format: 'uuid' },
    expectedRevision: { type: 'integer' },
    currentRevision: { type: 'integer' },
    createdAt: { type: 'string', format: 'date-time' },
  },
} as const;

export const syncPushResultJsonSchema = {
  type: 'object',
  required: ['acceptedChangeIds', 'conflicts', 'cursor'],
  additionalProperties: false,
  properties: {
    acceptedChangeIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
    conflicts: { type: 'array', items: syncConflictJsonSchema },
    cursor: { type: 'string', pattern: '^\\d+$' },
  },
} as const;

export const syncPullResultJsonSchema = {
  type: 'object',
  required: ['changes', 'nextCursor', 'hasMore'],
  additionalProperties: false,
  properties: {
    changes: { type: 'array', items: syncChangeJsonSchema },
    nextCursor: { type: 'string', pattern: '^\\d+$' },
    hasMore: { type: 'boolean' },
  },
} as const;
