export type Role = 'owner' | 'admin' | 'psychologist' | 'receptionist' | 'finance';
export interface User {
  id: string;
  displayName: string;
  role: Role;
}
export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: User;
}
export interface Syncable {
  id: string;
  updatedAt: string;
}
export interface Appointment extends Syncable {
  patientId: string;
  patientName: string;
  startsAt: string;
  endsAt: string;
  status: string;
}
export interface Patient extends Syncable {
  fullName: string;
  socialName?: string | null;
  phone?: string | null;
  status: string;
}
export interface ClinicalRecord extends Syncable {
  patientId: string;
  authorName: string;
  body: string;
  createdAt: string;
  amendmentOf?: string | null;
}
export interface Charge extends Syncable {
  patientName: string;
  description: string;
  amountMinor: number;
  dueDate: string;
  status: string;
}
export interface ClinicDocument extends Syncable {
  title: string;
  documentType: string;
  createdAt: string;
}
export interface Dashboard {
  sessionsThisMonth: number;
  activePatients: number;
  revenueThisMonthMinor: number;
  occupancyPercent: number;
  appointmentsToday: Appointment[];
}
export type Resource =
  'dashboard' | 'schedule' | 'patients' | 'clinical' | 'finance' | 'documents' | 'settings';
