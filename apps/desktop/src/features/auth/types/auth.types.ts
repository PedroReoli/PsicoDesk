export type UserRole = 'owner' | 'admin' | 'psychologist' | 'receptionist' | 'finance';

export interface SessionUser {
  id: string;
  displayName: string;
  username: string;
  role: UserRole;
  professionalRegistration?: string | null;
  status: string;
  createdAt: string;
}

export interface Session {
  token: string;
  expiresAt: string;
  user: SessionUser;
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface BootstrapAdminInput extends LoginInput {
  displayName: string;
}
