import { apiRequest } from '../api/client';
import { backoffDelay } from '../api/backoff';
import type { DeviceCredentials } from '../types/sync';
export type SocketFactory = (url: string) => WebSocket;
function websocketUrl(serverUrl: string, ticket: string) { return `${serverUrl.replace(/^http/, 'ws')}/v1/realtime?ticket=${encodeURIComponent(ticket)}`; }
export class ReconnectingSocket {
  private socket: WebSocket | null = null; private attempt = 0; private stopped = false; private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly credentials: DeviceCredentials, private readonly token: () => Promise<string>, private readonly onMessage: (data: unknown) => void, private readonly onState: (connected: boolean) => void, private readonly factory: SocketFactory = (url) => new WebSocket(url)) {}
  start() { this.stopped = false; void this.connect(); }
  stop() { this.stopped = true; if (this.timer) clearTimeout(this.timer); this.timer = null; this.socket?.close(); this.socket = null; this.onState(false); }
  private schedule() { this.onState(false); if (this.timer) clearTimeout(this.timer); if (!this.stopped) this.timer = setTimeout(() => { this.timer = null; this.attempt += 1; void this.connect(); }, backoffDelay(this.attempt)); }
  private async connect() { if (this.stopped) return; try { const accessToken = await this.token(); const response = await apiRequest<unknown>('/v1/realtime/ticket', { baseUrl: this.credentials.serverUrl, method: 'POST', token: accessToken, retries: 0 }); const item = response as { ticket?: unknown; expiresAt?: unknown }; if (typeof item.ticket !== 'string' || item.ticket.length < 32 || typeof item.expiresAt !== 'string' || Date.parse(item.expiresAt) <= Date.now()) throw new Error('Ticket realtime inválido.'); this.socket = this.factory(websocketUrl(this.credentials.serverUrl, item.ticket)); this.socket.onopen = () => { this.attempt = 0; this.onState(true); }; this.socket.onmessage = (event) => { try { const data = JSON.parse(String(event.data)) as unknown; const parsed = data as { type?: unknown }; if (parsed.type === 'batch.available' || parsed.type === 'sync.available' || parsed.type === 'device.presence' || parsed.type === 'pong') this.onMessage(data); } catch { /* Evento inválido é ignorado. */ } }; this.socket.onerror = () => this.socket?.close(); this.socket.onclose = () => this.schedule(); } catch { this.schedule(); } }
}
