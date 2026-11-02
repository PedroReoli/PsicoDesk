import WebSocket from 'ws';
import { realtimeEventSchema, type RealtimeEvent } from '@psicodesk/sync-protocol';

interface ClientConnection {
  deviceId: string;
  socket: WebSocket;
}

export class RealtimeHub {
  private readonly clinics = new Map<string, Set<ClientConnection>>();

  connect(clinicId: string, deviceId: string, socket: WebSocket): () => void {
    const clients = this.clinics.get(clinicId) ?? new Set<ClientConnection>();
    const client = { deviceId, socket };
    clients.add(client);
    this.clinics.set(clinicId, clients);
    this.publish(clinicId, { type: 'device.presence', deviceId, status: 'online' }, deviceId);
    return () => {
      clients.delete(client);
      if (clients.size === 0) this.clinics.delete(clinicId);
      else
        this.publish(clinicId, { type: 'device.presence', deviceId, status: 'offline' }, deviceId);
    };
  }

  publish(clinicId: string, event: RealtimeEvent, excludeDeviceId?: string): void {
    const safeEvent = realtimeEventSchema.parse(event);
    const payload = JSON.stringify(safeEvent);
    for (const client of this.clinics.get(clinicId) ?? []) {
      if (client.deviceId !== excludeDeviceId && client.socket.readyState === WebSocket.OPEN)
        client.socket.send(payload);
    }
  }
}
