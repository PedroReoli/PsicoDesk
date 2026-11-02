export interface Patient {
  id: string;
  fullName: string;
  socialName?: string | null;
  phone?: string | null;
  email?: string | null;
  status: 'active' | 'inactive';
  createdAt: string;
  version: number;
}

export interface PatientInput {
  fullName: string;
  socialName?: string;
  phone?: string;
  email?: string;
  status?: 'active' | 'inactive';
  version?: number;
}

export function validatePatient(input: PatientInput) {
  const errors: Partial<Record<keyof PatientInput, string>> = {};
  if (input.fullName.trim().length < 3) errors.fullName = 'Informe o nome completo.';
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))
    errors.email = 'Informe um e-mail válido.';
  return errors;
}
