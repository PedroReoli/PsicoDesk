export type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  professionalId: string;
  professionalName: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  cancellationReason?: string | null;
  version: number;
}
export interface AppointmentUpdateInput {
  status: AppointmentStatus;
  cancellationReason?: string;
  startsAt?: string;
  endsAt?: string;
  version: number;
}
export interface AppointmentInput {
  patientId: string;
  professionalId: string;
  startsAt: string;
  endsAt: string;
  kind: string;
  recurrenceId?: string;
}
export function hasValidPeriod(input: AppointmentInput) {
  return new Date(input.startsAt).getTime() < new Date(input.endsAt).getTime();
}

export function normalizeAppointmentInput(input: AppointmentInput): AppointmentInput {
  return {
    ...input,
    startsAt: new Date(input.startsAt).toISOString(),
    endsAt: new Date(input.endsAt).toISOString(),
  };
}
