import { invokeCommand } from '../../../shared/services/tauriClient';
import type { ClinicDocument, GenerateDocumentInput } from '../types/document.types';
export const documentsService = {
  list: (sessionToken: string, patientId?: string) =>
    invokeCommand<ClinicDocument[]>('list_documents', {
      sessionToken,
      patientId: patientId?.length ? patientId : undefined,
    }),
  generate: (sessionToken: string, input: GenerateDocumentInput) =>
    invokeCommand<ClinicDocument>('generate_document', { sessionToken, input }),
  export: (sessionToken: string, documentId: string) =>
    invokeCommand<string>('export_document', { sessionToken, documentId }),
};
