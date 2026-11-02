import { forwardRef, useId } from 'react';

import { classNames } from '../../shared/utils/classNames';
import type { InputProps } from './Input.types';
import styles from './Input.module.css';

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, label, hint, error, className, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;
  const control = (
    <input
      ref={ref}
      id={inputId}
      className={classNames(
        styles.input,
        (invalid === true || error !== undefined) && styles.invalid,
        className,
      )}
      aria-invalid={invalid === true || error !== undefined ? true : undefined}
      aria-describedby={hint !== undefined || error !== undefined ? messageId : undefined}
      {...props}
    />
  );

  if (label === undefined && hint === undefined && error === undefined) return control;

  return (
    <div className={styles.field}>
      {label && (
        <label htmlFor={inputId}>
          {label}
          {props.required && <span aria-hidden="true"> *</span>}
        </label>
      )}
      {control}
      {(error !== undefined || hint !== undefined) && (
        <p
          id={messageId}
          className={error !== undefined ? styles.error : styles.hint}
          role={error !== undefined ? 'alert' : undefined}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
});

export type { InputProps } from './Input.types';
