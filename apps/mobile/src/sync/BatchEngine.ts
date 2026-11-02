import { ApiError, apiRequest, type ApiDependencies } from '../api/client.ts';
import { backoffDelay, isRetryableStatus } from '../api/backoff.ts';
import type { BatchStore } from '../database/batchRepository.ts';
import { parseTransferItems } from '../database/projectionMaterializer.ts';
import type { BatchEnvelope, BatchListResult, BatchMetadata, DeviceCredentials, SyncCounts } from '../types/sync.ts';
import { assembleEnvelope, parseBatchList } from './batchProtocol.ts';
export interface BatchTransport { send(credentials: DeviceCredentials, token: string, envelope: BatchEnvelope): Promise<void>; list(credentials: DeviceCredentials, token: string, cursor: string): Promise<BatchListResult>; payload(credentials: DeviceCredentials, token: string, metadata: BatchMetadata): Promise<BatchEnvelope>; acknowledge(credentials: DeviceCredentials, token: string, batchId: string, status: 'applied' | 'rejected', importedAt: string): Promise<void>; }
export interface BatchCryptography { create(credentials: DeviceCredentials, payload: unknown): Promise<BatchEnvelope>; open(credentials: DeviceCredentials, envelope: BatchEnvelope): Promise<unknown>; }
export class ApiBatchTransport implements BatchTransport {
  constructor(private readonly dependencies?: ApiDependencies) {}
  async send(credentials: DeviceCredentials, token: string, envelope: BatchEnvelope) { await apiRequest('/v1/batches', { baseUrl: credentials.serverUrl, method: 'POST', token, body: envelope, idempotencyKey: envelope.batchId, retries: 2 }, this.dependencies); }
  async list(credentials: DeviceCredentials, token: string, cursor: string) { return parseBatchList(await apiRequest<unknown>(`/v1/batches?cursor=${encodeURIComponent(cursor)}&limit=50`, { baseUrl: credentials.serverUrl, token, retries: 2 }, this.dependencies)); }
  async payload(credentials: DeviceCredentials, token: string, metadata: BatchMetadata) { return assembleEnvelope(metadata, await apiRequest<unknown>(`/v1/batches/${metadata.batchId}/payload`, { baseUrl: credentials.serverUrl, token, retries: 2 }, this.dependencies)); }
  async acknowledge(credentials: DeviceCredentials, token: string, batchId: string, status: 'applied' | 'rejected', importedAt = new Date().toISOString()) { await apiRequest(`/v1/batches/${batchId}/ack`, { baseUrl: credentials.serverUrl, method: 'POST', token, body: { status, importedAt }, idempotencyKey: `ack-${batchId}`, retries: 2 }, this.dependencies); }
}
export class BatchEngine {
  constructor(private readonly store: BatchStore, private readonly transport: BatchTransport, private readonly cryptography: BatchCryptography) {}
  async queue(credentials: DeviceCredentials, payload: unknown) { const envelope = await this.cryptography.create(credentials, payload); await this.store.queue(envelope); return envelope.batchId; }
  async run(credentials: DeviceCredentials, token: string): Promise<SyncCounts> {
    for (const envelope of await this.store.due()) { try { await this.transport.send(credentials, token, envelope); await this.store.sent(envelope.batchId); } catch (cause) { const api = cause instanceof ApiError ? cause : null; const retryable = !api || api.code === 'NETWORK_ERROR' || isRetryableStatus(api.status); await this.store.failed(envelope.batchId, api?.code ?? 'BATCH_SEND_ERROR', new Date(Date.now() + (retryable ? backoffDelay(1) : 0)).toISOString(), !retryable); if (retryable) throw cause; } }
    let cursor = await this.store.cursor();
    for (let page = 0; page < 10; page += 1) { const listing = await this.transport.list(credentials, token, cursor); for (const metadata of listing.items) { const envelope = await this.transport.payload(credentials, token, metadata); let plaintext: unknown; try { plaintext = await this.cryptography.open(credentials, envelope); parseTransferItems(plaintext); } catch (cause) { if (cause instanceof ApiError) throw cause; await this.transport.acknowledge(credentials, token, envelope.batchId, 'rejected', metadata.receivedAt); continue; } const receipt = await this.store.saveImported(envelope, plaintext); await this.transport.acknowledge(credentials, token, envelope.batchId, 'applied', receipt.importedAt); } cursor = listing.nextCursor; await this.store.setCursor(cursor); if (!listing.hasMore) break; }
    return this.store.counts();
  }
}
