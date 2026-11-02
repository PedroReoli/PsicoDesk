import type { HTMLAttributes } from 'react';

import { classNames } from '../../shared/utils/classNames';
import styles from './Badge.module.css';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return <span className={classNames(styles.badge, styles[tone], className)} {...props} />;
}

