import { createHmac, timingSafeEqual } from 'node:crypto';
import type { DeviceIdentity } from '../domain/types.js';
import { errors } from '../domain/errors.js';
import type { AuthRepository } from '../repositories/contracts.js';

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly pepper: string,
  ) {}

  async authenticateDevice(
    clinicId: string,
    deviceId: string,
    deviceSecret: string,
  ): Promise<DeviceIdentity> {
    const device = await this.repository.findDevice(clinicId, deviceId);
    const receivedHash = this.hashSecret(deviceSecret);
    const storedHash = device?.secretHash ?? '0'.repeat(64);
    const matches = safeHexEquals(storedHash, receivedHash);
    if (!device || device.status !== 'active' || !matches) throw errors.unauthenticated();
    await this.repository.touchDevice(clinicId, deviceId);
    return device;
  }

  async validatePrincipal(clinicId: string, deviceId: string): Promise<DeviceIdentity> {
    const device = await this.repository.findDevice(clinicId, deviceId);
    if (!device || device.status !== 'active') throw errors.unauthenticated();
    return device;
  }

  hashSecret(secret: string): string {
    return createHmac('sha256', this.pepper).update(secret, 'utf8').digest('hex');
  }
}

function safeHexEquals(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
