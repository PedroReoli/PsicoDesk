import type { ReactNode } from 'react';

import { Button } from '../primitives/Button';
import { Icon } from '../primitives/Icon';
import { classNames } from '../../shared/utils/classNames';
import styles from './RightPanel.module.css';

interface RightPanelProps {
  open: boolean;
  title: string;
  description?: string | undefined;
  width?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  footer?: ReactNode | undefined;
  onClose?: (() => void) | undefined;
}

export function RightPanel({ open, title, description, width = 'sm', children, footer, onClose }: RightPanelProps) {
  if (!open) return null;

  return (
    <aside className={classNames(styles.panel, styles[width])} aria-label={title}>
      <header className={styles.header}>
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" aria-label={`Fechar ${title}`} onClick={onClose}>
            <Icon name="x" size={18} />
          </Button>
        )}
      </header>
      <div className={styles.body}>{children}</div>
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </aside>
  );
}

