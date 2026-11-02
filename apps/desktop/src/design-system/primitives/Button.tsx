import { classNames } from '../../shared/utils/classNames';
import type { ButtonProps } from './Button.types';
import styles from './Button.module.css';

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  children,
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={classNames(
        styles.button,
        styles[variant],
        styles[size],
        fullWidth && styles.full,
        className,
      )}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}

export type { ButtonProps } from './Button.types';
