import { createHash } from 'node:crypto';
import type { AcknowledgeBatch, BatchMetadata, CreateBatch } from '@psicodesk/sync-protocol';
import { errors } from '../domain/errors.js';
import type { Principal, StoredBatch } from '../domain/types.js';
import type { BatchRepository } from '../repositories/contracts.js';

const MAX_PAYLOAD_BYTES = 20 * 1024 * 1024;
const MAX_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;

export class BatchService {
  constructor(private readonly repository: BatchRepository) {}

  async create(
    principal: Principal,
    idempotencyKey: string,
    input: CreateBatch,
  ): Promise<{ batch: BatchMetadata; created: boolean }> {
    requireScope(principal, 'batches:write');
    if (input.originDeviceId !== principal.deviceId) throw errors.forbidden();
    const payload = Buffer.from(input.payloadBase64, 'base64');
    if (payload.byteLength === 0 || payload.byteLength > MAX_PAYLOAD_BYTES)
      throw errors.badRequest('Carga fora do limite permitido.');
    if (stripPadding(payload.toString('base64')) !== stripPadding(input.payloadBase64))
      throw errors.badRequest('Carga base64 inválida.');
    const digest = createHash('sha256').update(payload).digest('hex');
    if (digest.toLowerCase() !== input.contentHash.toLowerCase())
      throw errors.badRequest('Hash da carga não confere.');
    const now = Date.now();
    const expiresAt = Date.parse(input.expiresAt);
    if (expiresAt <= now || expiresAt - now > MAX_RETENTION_MS)
      throw errors.badRequest('Expiração deve estar no futuro e limitada a 7 dias.');
    const result = await this.repository.create(principal.clinicId, idempotencyKey, input, payload);
    return { batch: toMetadata(result.batch), created: result.created };
  }

  async metadata(principal: Principal, batchId: string): Promise<BatchMetadata> {
    requireScope(principal, 'batches:read');
    const batch = await this.repository.findMetadata(
      principal.clinicId,
      principal.deviceId,
      batchId,
    );
    if (!batch) throw errors.notFound();
    return toMetadata(batch);
  }

  async payload(
    principal: Principal,
    batchId: string,
  ): Promise<{ payloadBase64: string; contentHash: string }> {
    requireScope(principal, 'batches:read');
    const batch = await this.repository.findPayload(
      principal.clinicId,
      principal.deviceId,
      batchId,
    );
    if (!batch) throw errors.notFound();
    return {
      payloadBase64: Buffer.from(batch.payload).toString('base64'),
      contentHash: batch.contentHash,
    };
  }

  async acknowledge(
    principal: Principal,
    batchId: string,
    input: AcknowledgeBatch,
  ): Promise<BatchMetadata> {
    requireScope(principal, 'batches:write');
    const batch = await this.repository.acknowledge(
      principal.clinicId,
      principal.deviceId,
      batchId,
      input,
    );
    if (!batch) throw errors.notFound();
    return toMetadata(batch);
  }

  async remove(principal: Principal, batchId: string): Promise<void> {
    requireScope(principal, 'batches:write');
    if (!(await this.repository.softDelete(principal.clinicId, principal.deviceId, batchId)))
      throw errors.notFound();
  }
}

function stripPadding(value: string): string {
  return value.replace(/=+$/, '');
}

export function requireScope(principal: Principal, scope: Principal['scopes'][number]): void {
  if (!principal.scopes.includes(scope)) throw errors.forbidden();
}

function toMetadata(batch: StoredBatch): BatchMetadata {
  const { payload: _payload, idempotencyKey: _idempotencyKey, ...metadata } = batch;
  return metadata;
}
