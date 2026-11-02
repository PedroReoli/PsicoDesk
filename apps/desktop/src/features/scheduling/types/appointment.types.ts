export type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'missed';
export interface Appointment { id: string; patientId: string; patientName: string; professionalId: string; startsAt: string; endsAt: string; status: AppointmentStatus; notes?: string | null; }
export interface AppointmentInput { patientId: string; professionalId: string; startsAt: string; endsAt: string; kind: string; recurrenceId?: string; }
export function hasValidPeriod(input: AppointmentInput) { return new Date(input.startsAt).getTime() < new Date(input.endsAt).getTime(); }
