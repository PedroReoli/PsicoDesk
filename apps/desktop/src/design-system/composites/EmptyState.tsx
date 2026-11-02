import type { ReactNode } from 'react';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <section className={styles.empty}>
      {icon && <span className={styles.icon}>{icon}</span>}
      <h2>{title}</h2>
      <p>{description}</p>
      {action && <div>{action}</div>}
    </section>
  );
}

