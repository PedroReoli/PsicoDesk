import { PageHeader } from '../../../design-system/composites/PageHeader';
import { Button } from '../../../design-system/primitives/Button';
import { MetricBar } from '../components/MetricBar';
import { useReports } from '../hooks/useReports';
import styles from '../styles/reports.module.css';
const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value / 100);
export default function ReportsPage() {
  const { data, loading, error, reload } = useReports();
  return (
    <section className={styles.page}>
      <PageHeader
        eyebrow="Indicadores"
        title="Relatórios"
        description="Visão agregada do período atual, respeitando o escopo de acesso da sessão."
      />
      {loading ? (
        <div className={styles.state}>Calculando indicadores…</div>
      ) : error ? (
        <div className={styles.state}>
          <p role="alert">{error}</p>
          <Button onClick={() => void reload()}>Tentar novamente</Button>
        </div>
      ) : (
        data && (
          <>
            <div className={styles.hero}>
              <div>
                <span>Ocupação estimada</span>
                <strong>{data.occupancyPercent}%</strong>
                <p>Com base nos horários disponíveis e atendimentos registrados no mês.</p>
              </div>
              <div>
                <span>Receita registrada</span>
                <strong>{money(data.revenueThisMonthMinor)}</strong>
                <p>{money(data.pendingAmountMinor)} permanecem pendentes.</p>
              </div>
            </div>
            <section className={styles.panel}>
              <h2>Resumo operacional</h2>
              <MetricBar
                metric={{
                  label: 'Sessões realizadas',
                  value: data.sessionsThisMonth,
                  maximum: Math.max(data.sessionsThisMonth, 100),
                  formatted: String(data.sessionsThisMonth),
                }}
              />
              <MetricBar
                metric={{
                  label: 'Pacientes ativos',
                  value: data.activePatients,
                  maximum: Math.max(data.activePatients, 80),
                  formatted: String(data.activePatients),
                }}
              />
              <MetricBar
                metric={{
                  label: 'Ocupação',
                  value: data.occupancyPercent,
                  maximum: 100,
                  formatted: `${String(data.occupancyPercent)}%`,
                }}
              />
            </section>
            <p className={styles.note}>
              Indicadores são informativos e não substituem avaliação clínica, contábil ou
              financeira.
            </p>
          </>
        )
      )}
    </section>
  );
}
