export interface DashboardAppointment {
  id: string;
  patientName: string;
  startsAt: string;
  status: string;
}
export interface DashboardReport {
  sessionsThisMonth: number;
  activePatients: number;
  revenueThisMonthMinor: number;
  occupancyPercent: number;
  pendingAmountMinor: number;
  appointmentsToday: DashboardAppointment[];
}
