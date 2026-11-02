import { useId, useMemo, useState } from 'react';
import { Input } from '../../design-system/primitives/Input';
import type { DirectoryOption } from '../services/directory.service';
import styles from './OptionPicker.module.css';

interface OptionPickerProps {
  label: string;
  options: DirectoryOption[];
  value: string;
  onChange: (value: string) => void;
  loading?: boolean;
  error?: string | null;
  required?: boolean;
  emptyLabel?: string;
}

export function OptionPicker({
  label,
  options,
  value,
  onChange,
  loading = false,
  error,
  required = false,
  emptyLabel,
}: OptionPickerProps) {
  const [query, setQuery] = useState('');
  const listId = useId();
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    return normalized
      ? options.filter((option) => option.displayName.toLocaleLowerCase('pt-BR').includes(normalized))
      : options;
  }, [options, query]);

  return (
    <fieldset className={styles.fieldset} aria-describedby={error ? `${listId}-error` : undefined}>
      <legend>
        {label} {required && <span aria-hidden="true">*</span>}
      </legend>
      <Input
        aria-label={`Buscar ${label.toLocaleLowerCase('pt-BR')}`}
        placeholder="Digite para filtrar"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      <div id={listId} className={styles.options} role="radiogroup" aria-label={label}>
        {loading ? (
          <p role="status">Carregando opções…</p>
        ) : filtered.length || emptyLabel ? (
          <>
            {emptyLabel && (
              <button
                type="button"
                className={!value ? styles.selected : styles.option}
                role="radio"
                aria-checked={!value}
                onClick={() => {
                  onChange('');
                }}
              >
                <strong>{emptyLabel}</strong>
              </button>
            )}
            {filtered.map((option) => (
            <button
              key={option.id}
              type="button"
              className={option.id === value ? styles.selected : styles.option}
              role="radio"
              aria-checked={option.id === value}
              onClick={() => {
                onChange(option.id);
              }}
            >
              <strong>{option.displayName}</strong>
              {option.professionalRegistration && <small>{option.professionalRegistration}</small>}
            </button>
            ))}
          </>
        ) : (
          <p>Nenhuma opção encontrada.</p>
        )}
      </div>
      {error && (
        <p id={`${listId}-error`} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
