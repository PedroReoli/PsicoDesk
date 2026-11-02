import type { PropsWithChildren } from 'react';
import styles from './ContentArea.module.css';

export function ContentArea({ children }: PropsWithChildren) {
  return (
    <main id="main-content" className={styles.content}>
      {children}
    </main>
  );
}
