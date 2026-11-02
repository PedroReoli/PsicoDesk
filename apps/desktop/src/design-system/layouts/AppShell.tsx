import { useState } from 'react';
import { Outlet } from 'react-router-dom';

import type { NavigationRole } from '../../shared/constants/navigation';
import { AppHeader } from './AppHeader';
import { ContentArea } from './ContentArea';
import { Sidebar } from './Sidebar';
import styles from './AppShell.module.css';

interface AppShellProps {
  userDisplayName: string;
  userRole: NavigationRole;
  onLogout: () => Promise<void>;
}

export function AppShell({ userDisplayName, userRole, onLogout }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main-content">
        Pular para o conteúdo
      </a>
      <Sidebar
        collapsed={collapsed}
        userDisplayName={userDisplayName}
        userRole={userRole}
        onToggle={() => {
          setCollapsed((value) => !value);
        }}
      />
      <div className={styles.workspace}>
        <AppHeader userDisplayName={userDisplayName} onLogout={onLogout} />
        <ContentArea>
          <Outlet />
        </ContentArea>
      </div>
    </div>
  );
}
