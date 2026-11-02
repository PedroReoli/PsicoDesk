import type { IconName } from '../../design-system/primitives/Icon';

export interface NavigationItem {
  label: string;
  path: string;
  icon: IconName;
  description: string;
}

export type NavigationRole = 'owner' | 'admin' | 'psychologist' | 'receptionist' | 'finance';

export const primaryNavigation: NavigationItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: 'dashboard', description: 'Visão geral da clínica' },
  { label: 'Agenda', path: '/agenda', icon: 'calendar', description: 'Sessões e disponibilidade' },
  { label: 'Pacientes', path: '/pacientes', icon: 'patients', description: 'Cadastros e vínculos' },
  { label: 'Prontuário', path: '/prontuario', icon: 'clipboard', description: 'Registros clínicos protegidos' },
  { label: 'Financeiro', path: '/financeiro', icon: 'finance', description: 'Receitas, repasses e caixa' },
  { label: 'Documentos', path: '/documentos', icon: 'document', description: 'Templates e exportações' },
  { label: 'Relatórios', path: '/relatorios', icon: 'report', description: 'Indicadores agregados' },
];

export const settingsNavigation: NavigationItem = {
  label: 'Configurações',
  path: '/configuracoes',
  icon: 'settings',
  description: 'Usuários, segurança e backup',
};

export function getNavigationItem(pathname: string) {
  return [...primaryNavigation, settingsNavigation].find((item) => pathname.startsWith(item.path));
}

const routeRoles: Record<string, NavigationRole[]> = {
  '/dashboard': ['owner', 'admin', 'psychologist', 'receptionist', 'finance'],
  '/agenda': ['owner', 'admin', 'psychologist', 'receptionist'],
  '/pacientes': ['owner', 'admin', 'psychologist', 'receptionist'],
  '/prontuario': ['psychologist'],
  '/financeiro': ['owner', 'admin', 'finance'],
  '/documentos': ['owner', 'admin', 'psychologist', 'receptionist'],
  '/relatorios': ['owner', 'admin', 'psychologist', 'finance'],
  '/configuracoes': ['owner', 'admin'],
};

export function canViewNavigationItem(role: NavigationRole, path: string) {
  return routeRoles[path]?.includes(role) ?? false;
}

