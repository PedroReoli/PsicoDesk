import type { Principal } from '../domain/types.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal;
  }
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  }
}
