import type { ReactNode } from 'react';
import styles from './DataTable.module.css';

export interface ColumnDef<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: 'start' | 'center' | 'end';
}

interface DataTableProps<T> {
  caption: string;
  columns: ColumnDef<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyState?: ReactNode;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({ caption, columns, rows, getRowKey, emptyState, onRowClick }: DataTableProps<T>) {
  if (rows.length === 0 && emptyState) return <>{emptyState}</>;

  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        <caption className="sr-only">{caption}</caption>
        <thead><tr>{columns.map((column) => <th key={column.key} className={styles[column.align ?? 'start']}>{column.header}</th>)}</tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)} onClick={onRowClick ? () => { onRowClick(row); } : undefined} className={onRowClick ? styles.clickable : undefined} tabIndex={onRowClick ? 0 : undefined} onKeyDown={onRowClick ? (event) => { if (event.key === 'Enter' || event.key === ' ') onRowClick(row); } : undefined}>
              {columns.map((column) => <td key={column.key} className={styles[column.align ?? 'start']}>{column.render(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

