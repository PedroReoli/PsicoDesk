import type { FastifyPluginAsync } from 'fastify';
import type { RealtimeHub } from '../services/realtime-hub.js';
import { requireScope } from '../services/batch-service.js';

export function realtimeRoutes(hub: RealtimeHub): FastifyPluginAsync {
  return async (app) => {
    app.get(
      '/v1/realtime',
      { websocket: true, preValidation: [app.authenticate], schema: { hide: true } },
      (socket, request) => {
        requireScope(request.principal, 'realtime:connect');
        const disconnect = hub.connect(
          request.principal.clinicId,
          request.principal.deviceId,
          socket,
        );
        socket.on('message', (data) => {
          if (data.byteLength > 1_024) {
            socket.close(1009, 'message too large');
            return;
          }
          try {
            const message = JSON.parse(data.toString()) as { type?: unknown };
            if (message.type === 'ping')
              socket.send(JSON.stringify({ type: 'pong', at: new Date().toISOString() }));
            else socket.close(1003, 'unsupported event');
          } catch {
            socket.close(1007, 'invalid json');
          }
        });
        socket.once('close', disconnect);
        socket.once('error', disconnect);
      },
    );
  };
}
