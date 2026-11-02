import { invokeCommand } from '../../../shared/services/tauriClient';
import type { Charge, ChargeInput, ChargeStatus, PaymentInput } from '../types/finance.types';
export const financeService = {
  list: (sessionToken: string, status?: ChargeStatus) =>
    invokeCommand<Charge[]>('list_charges', { sessionToken, status }),
  create: (sessionToken: string, input: ChargeInput) =>
    invokeCommand<Charge>('create_charge', { sessionToken, input }),
  registerPayment: (sessionToken: string, chargeId: string, input: PaymentInput) =>
    invokeCommand('register_payment', { sessionToken, chargeId, input }),
};
