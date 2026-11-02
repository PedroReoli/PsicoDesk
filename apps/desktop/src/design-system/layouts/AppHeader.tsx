import { useLocation } from 'react-router-dom';

import { getNavigationItem } from '../../shared/constants/navigation';
import { Badge } from '../primitives/Badge';
import { Button } from '../primitives/Button';
import { Icon } from '../primitives/Icon';
import styles from './AppHeader.module.css';

interface AppHeaderProps {
  userDisplayName: string;
  onLogout: () => Promise<void>;
}

export function AppHeader({ userDisplayName, onLogout }: AppHeaderProps) {
  const { pathname } = useLocation();
  const current = getNavigationItem(pathname);

  return (
    <header className={styles.header}>
      <div className={styles.location}>
        <span className={styles.kicker}>PsicoDesk</span>
        <strong>{current?.label ?? 'Área de trabalho'}</strong>
      </div>
      <div className={styles.actions}>
        <Badge tone="success"><span className={styles.statusDot} /> Dados locais protegidos</Badge>
        <span className={styles.userName}>{userDisplayName}</span>
        <Button variant="ghost" size="sm" aria-label="Pesquisar"><Icon name="search" size={19} /></Button>
        <Button variant="ghost" size="sm" aria-label="Notificações"><Icon name="bell" size={19} /></Button>
        <Button variant="secondary" size="sm" onClick={onLogout}>Sair</Button>
      </div>
    </header>
  );
}

