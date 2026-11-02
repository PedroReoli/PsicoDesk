import { invokeCommand } from '../../../shared/services/tauriClient';
import type { Patient, PatientInput } from '../types/patient.types';

export const patientsService = {
  list(sessionToken: string, query = '') {
    return invokeCommand<Patient[]>('list_patients', { sessionToken, query: query || undefined });
  },
  create(sessionToken: string, input: PatientInput) {
    return invokeCommand<Patient>('create_patient', { sessionToken, input });
  },
  update(sessionToken: string, patientId: string, input: PatientInput) {
    return invokeCommand<Patient>('update_patient', { sessionToken, patientId, input });
  },
};
