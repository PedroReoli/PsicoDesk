import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { RegisterDeviceInput, RegisteredDevice } from '@psicodesk/sync-protocol';
import { errors } from '../domain/errors.js';
import type { DeviceRegistrationRepository } from '../repositories/contracts.js';
import { AuthService } from './auth-service.js';

export interface DeviceRegistrationGenerators {
  deviceId(): string;
  deviceSecret(): string;
  now(): Date;
}

const defaultGenerators: DeviceRegistrationGenerators = {
  deviceId: randomUUID,
  deviceSecret: () => randomBytes(32).toString('base64url'),
  now: () => new Date(),
};

export class DeviceRegistrationService {
  constructor(
    private readonly repository: DeviceRegistrationRepository,
    private readonly authService: AuthService,
    private readonly pepper: string,
    private readonly generators: DeviceRegistrationGenerators = defaultGenerators,
  ) {}

  async register(input: RegisterDeviceInput): Promise<RegisteredDevice> {
    const deviceId = this.generators.deviceId();
    const deviceSecret = this.generators.deviceSecret();
    const createdAt = this.generators.now().toISOString();
    const enrollmentTokenHash = createHmac('sha256', this.pepper)
      .update(`enrollment:${input.enrollmentToken}`, 'utf8')
      .digest('hex');
    const result = await this.repository.consumeEnrollmentAndCreateDevice({
      clinicId: input.clinicId,
      enrollmentTokenHash,
      deviceId,
      deviceName: input.deviceName,
      deviceSecretHash: this.authService.hashSecret(deviceSecret),
      signingPublicKey: input.signingPublicKey,
      signingKeyFingerprint: AuthService.fingerprintSigningKey(input.signingPublicKey),
      createdAt,
    });
    if (!result) throw errors.unauthenticated();
    return {
      clinicId: input.clinicId,
      deviceId,
      deviceSecret,
      scopes: [...result.scopes],
      signingPublicKey: input.signingPublicKey,
      signingKeyFingerprint: AuthService.fingerprintSigningKey(input.signingPublicKey),
      createdAt,
    };
  }

  hashEnrollmentToken(token: string): string {
    return createHmac('sha256', this.pepper).update(`enrollment:${token}`, 'utf8').digest('hex');
  }
}
