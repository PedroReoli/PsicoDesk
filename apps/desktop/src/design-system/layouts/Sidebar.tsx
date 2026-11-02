import { NavLink } from 'react-router-dom';

import {
  canViewNavigationItem,
  primaryNavigation,
  settingsNavigation,
  type NavigationItem,
  type NavigationRole,
} from '../../shared/constants/navigation';
import { classNames } from '../../shared/utils/classNames';
import { Button } from '../primitives/Button';
import { Icon } from '../primitives/Icon';
import { BrandMark } from './BrandMark';
import styles from './Sidebar.module.css';

interface SidebarProps {
  collapsed: boolean;
  userDisplayName: string;
  userRole: NavigationRole;
  onToggle: () => void;
}

function NavigationLink({ item, collapsed }: { item: NavigationItem; collapsed: boolean }) {
  return (
    <NavLink
      to={item.path}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) => classNames(styles.link, isActive && styles.active)}
    >
      <Icon name={item.icon} size={19} />
      {!collapsed && <span>{item.label}</span>}
    </NavLink>
  );
}

export function Sidebar({ collapsed, userDisplayName, userRole, onToggle }: SidebarProps) {
  const visibleNavigation = primaryNavigation.filter((item) =>
    canViewNavigationItem(userRole, item.path),
  );
  const canViewSettings = canViewNavigationItem(userRole, settingsNavigation.path);

  return (
    <aside className={classNames(styles.sidebar, collapsed && styles.collapsed)}>
      <div className={styles.top}>
        <BrandMark compact={collapsed} />
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          aria-label={collapsed ? 'Expandir navegação' : 'Recolher navegação'}
        >
          <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={18} />
        </Button>
      </div>
      <nav aria-label="Navegação principal" className={styles.navigation}>
        {visibleNavigation.map((item) => (
          <NavigationLink key={item.path} item={item} collapsed={collapsed} />
        ))}
      </nav>
      <div className={styles.bottom}>
        {canViewSettings && <NavigationLink item={settingsNavigation} collapsed={collapsed} />}
        <div className={styles.profile}>
          <span className={styles.avatar}>DR</span>
          {!collapsed && (
            <span>
              <strong>{userDisplayName}</strong>
              <small>Profissional</small>
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
