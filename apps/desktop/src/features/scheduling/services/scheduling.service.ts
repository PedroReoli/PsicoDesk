import { invokeCommand } from '../../../shared/services/tauriClient';
import type {
  Appointment,
  AppointmentInput,
  AppointmentUpdateInput,
} from '../types/appointment.types';
export const schedulingService = {
  list(sessionToken: string, from: string, to: string) {
    return invokeCommand<Appointment[]>('list_appointments', { sessionToken, from, to });
  },
  create(sessionToken: string, input: AppointmentInput) {
    return invokeCommand<Appointment>('create_appointment', { sessionToken, input });
  },
  updateStatus(sessionToken: string, appointmentId: string, input: AppointmentUpdateInput) {
    return invokeCommand<Appointment>('update_appointment_status', {
      sessionToken,
      appointmentId,
      input,
    });
  },
};
