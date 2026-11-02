import styles from './RouteState.module.css';

export function RouteLoading() {
  return (
    <section className={styles.state} aria-live="polite" aria-busy="true">
      <span className={styles.loader} aria-hidden="true" />
      <div>
        <strong>Preparando sua área</strong>
        <p>Carregando os dados locais com segurança.</p>
      </div>
    </section>
  );
}

