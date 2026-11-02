/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense, type ReactNode } from 'react';
import { createHashRouter, Navigate } from 'react-router-dom';

import { AuthGate } from '../features/auth/components/AuthGate';
import { RouteLoading } from '../shared/components/RouteLoading';
import { RouteError } from '../shared/components/RouteError';
import { AuthenticatedAppShell } from './AuthenticatedAppShell';
import { AuthorizedRoute } from './AuthorizedRoute';

const DashboardPage = lazy(() => import('../features/dashboard/pages/DashboardPage'));
const SchedulingPage = lazy(() => import('../features/scheduling/pages/SchedulingPage'));
const PatientsPage = lazy(() => import('../features/patients/pages/PatientsPage'));
const ClinicalRecordsPage = lazy(
  () => import('../features/clinical-records/pages/ClinicalRecordsPage'),
);
const FinancePage = lazy(() => import('../features/finance/pages/FinancePage'));
const DocumentsPage = lazy(() => import('../features/documents/pages/DocumentsPage'));
const ReportsPage = lazy(() => import('../features/reports/pages/ReportsPage'));
const SettingsPage = lazy(() => import('../features/settings/pages/SettingsPage'));

function load(element: ReactNode) {
  return <Suspense fallback={<RouteLoading />}>{element}</Suspense>;
}

function authorized(path: string, element: ReactNode) {
  return <AuthorizedRoute path={path}>{load(element)}</AuthorizedRoute>;
}

export const appRouter = createHashRouter([
  {
    path: '/',
    element: <AuthGate><AuthenticatedAppShell /></AuthGate>,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: authorized('/dashboard', <DashboardPage />) },
      { path: 'agenda', element: authorized('/agenda', <SchedulingPage />) },
      { path: 'pacientes', element: authorized('/pacientes', <PatientsPage />) },
      { path: 'prontuario', element: authorized('/prontuario', <ClinicalRecordsPage />) },
      { path: 'financeiro', element: authorized('/financeiro', <FinancePage />) },
      { path: 'documentos', element: authorized('/documentos', <DocumentsPage />) },
      { path: 'relatorios', element: authorized('/relatorios', <ReportsPage />) },
      { path: 'configuracoes', element: authorized('/configuracoes', <SettingsPage />) },
      { path: '*', element: <Navigate to="/dashboard" replace /> },
    ],
  },
]);

