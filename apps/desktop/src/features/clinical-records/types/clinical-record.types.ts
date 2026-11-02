export interface ClinicalRecord {
  id: string;
  patientId: string;
  authorName: string;
  appointmentId?: string | null;
  body: string;
  createdAt: string;
  amendmentOf?: string | null;
  contentHash: string;
}
export interface ClinicalRecordInput {
  patientId: string;
  appointmentId?: string;
  body: string;
}
export interface AmendmentInput {
  body: string;
}
export function validateClinicalBody(body: string) {
  const length = body.trim().length;
  if (length < 10) return 'O registro precisa descrever o atendimento.';
  if (length > 20000) return 'O registro excede o limite de 20.000 caracteres.';
  return null;
}
