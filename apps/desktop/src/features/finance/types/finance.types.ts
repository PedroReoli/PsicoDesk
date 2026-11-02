export type ChargeStatus = 'pending' | 'overdue' | 'paid' | 'cancelled';
export interface Charge {
  id: string;
  patientId: string;
  patientName: string;
  description: string;
  amountMinor: number;
  paidMinor: number;
  dueDate: string;
  status: ChargeStatus;
  createdAt: string;
}
export type PaymentMethod = 'cash' | 'pix' | 'card' | 'transfer' | 'other';
export interface PaymentInput {
  amountMinor: number;
  method: PaymentMethod;
  paidAt: string;
}
export interface ChargeInput {
  patientId: string;
  description: string;
  amountMinor: number;
  dueDate: string;
}
export function parseCurrencyToMinor(value: string) {
  const normalized = value
    .replace(/\s/g, '')
    .replace('R$', '')
    .replace(/\./g, '')
    .replace(',', '.');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}
export function formatCurrency(amountMinor: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    amountMinor / 100,
  );
}
