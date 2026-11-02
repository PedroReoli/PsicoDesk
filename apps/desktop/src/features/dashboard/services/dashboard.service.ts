import { invokeCommand } from '../../../shared/services/tauriClient';
import type { DashboardReport } from '../types/dashboard.types';
export const dashboardService = {
  getReport: (sessionToken: string) =>
    invokeCommand<DashboardReport>('get_dashboard_report', { sessionToken }),
};
