import { invokeCommand } from './tauriClient';

export interface DirectoryOption {
  id: string;
  displayName: string;
  professionalRegistration?: string | null;
}

export const directoryService = {
  patients(sessionToken: string) {
    return invokeCommand<DirectoryOption[]>('list_patient_options', { sessionToken });
  },
  professionals(sessionToken: string) {
    return invokeCommand<DirectoryOption[]>('list_schedule_professionals', { sessionToken });
  },
};
