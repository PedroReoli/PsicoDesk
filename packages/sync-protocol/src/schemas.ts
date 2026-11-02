import { z } from 'zod';

export const uuidSchema = z.uuid();
export const isoDateTimeSchema = z.iso.datetime({ offset: true });
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i);
export const base64Schema = z
  .string()
  .min(4)
  .max(28_000_000)
  .regex(/^[A-Za-z0-9+/]*={0,2}$/);
export const cursorSchema = z.string().regex(/^\d+$/).default('0');
export const deviceScopeSchema = z.enum([
  'batches:read',
  'batches:write',
  'sync:read',
  'sync:write',
  'uploads:write',
  'realtime:connect',
  'devices:read',
]);

export const ed25519PublicKeySchema = z.string().regex(/^[A-Za-z0-9+/]{43}=$/);
export const ed25519SignatureSchema = z.string().regex(/^[A-Za-z0-9+/]{86}==$/);

export const encryptionMetadataSchema = z.object({
  algorithm: z.literal('aes-256-gcm'),
  keyId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9._:-]+$/),
  nonce: z.string().regex(/^[A-Za-z0-9+/]{16}$/),
});

export const syncEncryptionMetadataSchema = z.object({
  algorithm: z.literal('aes-256-gcm'),
  keyId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9._:-]+$/),
  nonce: z.string().regex(/^[A-Za-z0-9+/]{16}$/),
});

const createBatchBaseSchema = z.object({
  schemaVersion: z.number().int().min(1).max(100),
  batchId: uuidSchema,
  originDeviceId: uuidSchema,
  targetDeviceId: uuidSchema,
  createdAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  contentHash: sha256Schema,
  signerPublicKey: ed25519PublicKeySchema,
  signature: ed25519SignatureSchema,
  encryption: encryptionMetadataSchema,
  payloadBase64: base64Schema,
});

export const createBatchSchema = createBatchBaseSchema.superRefine((value, context) => {
  if (Date.parse(value.expiresAt) <= Date.parse(value.createdAt)) {
    context.addIssue({
      code: 'custom',
      path: ['expiresAt'],
      message: 'expiresAt deve ser posterior a createdAt',
    });
  }
});

export const batchStatusSchema = z.enum([
  'pending',
  'downloaded',
  'applied',
  'rejected',
  'deleted',
  'expired',
]);
export const batchMetadataSchema = createBatchBaseSchema.omit({ payloadBase64: true }).extend({
  clinicId: uuidSchema,
  deliveryCursor: cursorSchema,
  status: batchStatusSchema,
  receivedAt: isoDateTimeSchema,
  acknowledgedAt: isoDateTimeSchema.nullable(),
});

export const acknowledgeBatchSchema = z.object({
  status: z.enum(['applied', 'rejected']),
  importedAt: isoDateTimeSchema,
  resultHash: sha256Schema.optional(),
});

export const batchListQuerySchema = z.object({
  cursor: cursorSchema,
  limit: z.coerce.number().int().min(1).max(200).default(50),
  status: z.enum(['pending', 'downloaded']).optional(),
});

export const batchListResultSchema = z.object({
  items: z.array(batchMetadataSchema),
  nextCursor: cursorSchema,
  hasMore: z.boolean(),
});

export const registerDeviceInputSchema = z.object({
  clinicId: uuidSchema,
  enrollmentToken: z.string().min(32).max(512),
  deviceName: z.string().trim().min(1).max(120),
  signingPublicKey: ed25519PublicKeySchema,
});

export const registeredDeviceSchema = z.object({
  clinicId: uuidSchema,
  deviceId: uuidSchema,
  deviceSecret: z.string().min(32).max(512),
  scopes: z.array(deviceScopeSchema),
  signingPublicKey: ed25519PublicKeySchema,
  signingKeyFingerprint: sha256Schema,
  createdAt: isoDateTimeSchema,
});

export const devicePeerSchema = z.object({
  deviceId: uuidSchema,
  name: z.string().min(1).max(120),
  signingPublicKey: ed25519PublicKeySchema,
  signingKeyFingerprint: sha256Schema,
});

export const devicePeerListSchema = z.object({ peers: z.array(devicePeerSchema) });

export const deviceTokenInputSchema = z.object({
  clinicId: uuidSchema,
  deviceId: uuidSchema,
  deviceSecret: z.string().min(32).max(512),
});

export const deviceTokenResultSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.literal('Bearer'),
  expiresIn: z.number().int().positive(),
});

export const realtimeTicketResultSchema = z.object({
  ticket: z.string().min(32).max(512),
  expiresAt: isoDateTimeSchema,
});

export const syncOperationSchema = z.enum(['upsert', 'delete']);
export const syncEntityTypeSchema = z.enum([
  'patient',
  'appointment',
  'clinical_record',
  'charge',
  'payment',
  'document',
  'setting',
]);

export const pushChangeSchema = z.object({
  changeId: uuidSchema,
  entityType: syncEntityTypeSchema,
  entityId: uuidSchema,
  operation: syncOperationSchema,
  expectedRevision: z.number().int().min(0),
  modifiedAt: isoDateTimeSchema,
  encryption: syncEncryptionMetadataSchema,
  payloadCiphertext: base64Schema,
  payloadHash: sha256Schema,
});

export const syncPushSchema = z.object({
  schemaVersion: z.literal(1),
  deviceId: uuidSchema,
  changes: z.array(pushChangeSchema).min(1).max(500),
});

export const syncChangeSchema = pushChangeSchema.omit({ expectedRevision: true }).extend({
  cursor: cursorSchema,
  revision: z.number().int().positive(),
  sourceDeviceId: uuidSchema,
});

export const syncConflictSchema = z.object({
  conflictId: uuidSchema,
  entityType: syncEntityTypeSchema,
  entityId: uuidSchema,
  incomingChangeId: uuidSchema,
  expectedRevision: z.number().int().min(0),
  currentRevision: z.number().int().min(0),
  createdAt: isoDateTimeSchema,
});

export const syncPushResultSchema = z.object({
  acceptedChangeIds: z.array(uuidSchema),
  conflicts: z.array(syncConflictSchema),
  cursor: cursorSchema,
});

export const syncPullResultSchema = z.object({
  changes: z.array(syncChangeSchema),
  nextCursor: cursorSchema,
  hasMore: z.boolean(),
});

export const realtimeEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('batch.available'), batchId: uuidSchema }),
  z.object({ type: z.literal('sync.available'), cursor: cursorSchema }),
  z.object({
    type: z.literal('device.presence'),
    deviceId: uuidSchema,
    status: z.enum(['online', 'offline']),
  }),
  z.object({ type: z.literal('pong'), at: isoDateTimeSchema }),
]);

export type CreateBatch = z.infer<typeof createBatchSchema>;
export type BatchMetadata = z.infer<typeof batchMetadataSchema>;
export type AcknowledgeBatch = z.infer<typeof acknowledgeBatchSchema>;
export type BatchListQuery = z.infer<typeof batchListQuerySchema>;
export type BatchListResult = z.infer<typeof batchListResultSchema>;
export type RegisterDeviceInput = z.infer<typeof registerDeviceInputSchema>;
export type RegisteredDevice = z.infer<typeof registeredDeviceSchema>;
export type DevicePeer = z.infer<typeof devicePeerSchema>;
export type DevicePeerList = z.infer<typeof devicePeerListSchema>;
export type DeviceTokenInput = z.infer<typeof deviceTokenInputSchema>;
export type DeviceTokenResult = z.infer<typeof deviceTokenResultSchema>;
export type RealtimeTicketResult = z.infer<typeof realtimeTicketResultSchema>;
export type SyncPush = z.infer<typeof syncPushSchema>;
export type SyncChange = z.infer<typeof syncChangeSchema>;
export type SyncConflict = z.infer<typeof syncConflictSchema>;
export type SyncPushResult = z.infer<typeof syncPushResultSchema>;
export type SyncPullResult = z.infer<typeof syncPullResultSchema>;
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
