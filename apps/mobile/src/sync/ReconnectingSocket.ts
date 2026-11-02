import { API_URL, apiRequest } from '../api/client';
import { backoffDelay } from '../api/backoff';

export class ReconnectingSocket {
  private socket: WebSocket | null = null;
  private attempt = 0;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly token: string,
    private readonly onMessage: (data: unknown) => void,
    private readonly onState: (connected: boolean) => void,
  ) {}

  start() { this.stopped = false; void this.connect(); }
  stop() { this.stopped = true; if (this.timer) clearTimeout(this.timer); this.socket?.close(); this.socket = null; }

  private scheduleReconnect() {
    this.onState(false);
    if (this.timer) clearTimeout(this.timer);
    if (!this.stopped) this.timer = setTimeout(() => { this.timer = null; this.attempt += 1; void this.connect(); }, backoffDelay(this.attempt));
  }

  private async connect() {
    if (this.stopped || !API_URL) return;
    try {
      const { ticket } = await apiRequest<{ ticket: string }>('/v1/events/ticket', { method: 'POST', token: this.token, retries: 0 });
      if (typeof ticket !== 'string' || ticket.length < 16 || ticket.length > 2_048) throw new Error('Ticket de eventos inválido.');
      const url = `${API_URL.replace(/^http/, 'ws')}/v1/events?ticket=${encodeURIComponent(ticket)}`;
      this.socket = new WebSocket(url);
      this.socket.onopen = () => { this.attempt = 0; this.onState(true); };
      this.socket.onmessage = (event) => { try { this.onMessage(JSON.parse(String(event.data)) as unknown); } catch { /* Mensagens inválidas nunca são executadas. */ } };
      this.socket.onerror = () => this.socket?.close();
      this.socket.onclose = () => this.scheduleReconnect();
    } catch { this.scheduleReconnect(); }
  }
}
