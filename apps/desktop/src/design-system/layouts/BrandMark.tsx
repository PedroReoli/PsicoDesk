import styles from './BrandMark.module.css';

interface BrandMarkProps {
  compact?: boolean;
}

export function BrandMark({ compact }: BrandMarkProps) {
  return (
    <div className={styles.brand} aria-label="PsicoDesk">
      <span className={styles.symbol} aria-hidden="true">
        <span className={styles.hemisphere} />
        <span className={styles.hemisphere} />
      </span>
      {!compact && (
        <span className={styles.wordmark}>
          <strong>PsicoDesk</strong>
          <small>Clínica em equilíbrio</small>
        </span>
      )}
    </div>
  );
}
