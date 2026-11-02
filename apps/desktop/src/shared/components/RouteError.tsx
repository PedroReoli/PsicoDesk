import { useRouteError } from 'react-router-dom';

import { Button } from '../../design-system/primitives/Button';
import styles from './RouteState.module.css';

export function RouteError() {
  const error = useRouteError();
  const detail = error instanceof Error ? error.message : 'Não foi possível abrir esta área.';

  return (
    <main className={styles.error}>
      <span className={styles.errorCode}>Algo saiu do fluxo</span>
      <h1>Não conseguimos carregar esta tela</h1>
      <p>{detail}</p>
      <Button
        onClick={() => {
          window.location.assign('#/dashboard');
        }}
      >
        Voltar ao dashboard
      </Button>
    </main>
  );
}
