import { invokeCommand } from '../../../shared/services/tauriClient';
import type { OperationalReport } from '../types/report.types';
export const reportsService = {
  getOperational: (sessionToken: string) =>
    invokeCommand<OperationalReport>('get_dashboard_report', { sessionToken }),
};
