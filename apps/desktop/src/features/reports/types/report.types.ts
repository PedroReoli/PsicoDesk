export interface OperationalReport {
  sessionsThisMonth: number;
  activePatients: number;
  revenueThisMonthMinor: number;
  occupancyPercent: number;
  pendingAmountMinor: number;
}
export interface ReportMetric {
  label: string;
  value: number;
  maximum: number;
  formatted: string;
}
export function percentage(value: number, maximum: number) {
  return maximum <= 0 ? 0 : Math.min(100, Math.round((value / maximum) * 100));
}
