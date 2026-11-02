import fastifyJwt from '@fastify/jwt';
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { errors } from '../domain/errors.js';
import type { AuthService } from '../services/auth-service.js';

interface AuthPluginOptions {
  jwtSecret: string;
  authService: AuthService;
}
interface JwtClaims {
  sub: string;
  clinicId: string;
  deviceId: string;
  tokenType: 'device';
}

const authPluginImplementation: FastifyPluginAsync<AuthPluginOptions> = async (app, options) => {
  await app.register(fastifyJwt, {
    secret: options.jwtSecret,
    sign: { iss: 'psicodesk-api', aud: 'psicodesk-device' },
    verify: { allowedIss: 'psicodesk-api', allowedAud: 'psicodesk-device' },
  });

  app.decorateRequest('principal', null);
  app.decorate('authenticate', async function authenticate(request) {
    try {
      const claims = await request.jwtVerify<JwtClaims>();
      if (claims.tokenType !== 'device' || claims.sub !== claims.deviceId)
        throw errors.unauthenticated();
      const device = await options.authService.validatePrincipal(claims.clinicId, claims.deviceId);
      request.principal = {
        clinicId: device.clinicId,
        deviceId: device.deviceId,
        scopes: device.scopes,
      };
    } catch {
      throw errors.unauthenticated();
    }
  });
};

export const authPlugin = fp(authPluginImplementation, { name: 'psicodesk-auth' });
