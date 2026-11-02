import { useState } from 'react';
import { PageHeader } from '../../../design-system/composites/PageHeader';
import { RightPanel } from '../../../design-system/composites/RightPanel';
import { EmptyState } from '../../../design-system/composites/EmptyState';
import { Button } from '../../../design-system/primitives/Button';
import { Badge } from '../../../design-system/primitives/Badge';
import { AppointmentForm } from '../components/AppointmentForm';
import { useAppointments } from '../hooks/useAppointments';
import styles from '../styles/scheduling.module.css';
const statusLabel = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  missed: 'Faltou',
} as const;
export default function SchedulingPage() {
  const [reference, setReference] = useState(() => new Date());
  const [panel, setPanel] = useState(false);
  const { items, loading, error, reload, create } = useAppointments(reference);
  function shift(days: number) {
    setReference((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + days);
      return next;
    });
  }
  return (
    <section className={styles.page}>
      <PageHeader
        eyebrow="Operação"
        title="Agenda"
        description="Semana de atendimentos e conflitos validados no banco local."
        actions={
          <Button
            onClick={() => {
              setPanel(true);
            }}
          >
            Novo agendamento
          </Button>
        }
      />
      <div className={styles.week}>
        <Button
          variant="ghost"
          onClick={() => {
            shift(-7);
          }}
          aria-label="Semana anterior"
        >
          ←
        </Button>
        <strong>{reference.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</strong>
        <Button
          variant="ghost"
          onClick={() => {
            shift(7);
          }}
          aria-label="Próxima semana"
        >
          →
        </Button>
      </div>
      {loading ? (
        <div className={styles.state}>Carregando agenda…</div>
      ) : error ? (
        <div className={styles.state}>
          <p role="alert">{error}</p>
          <Button onClick={() => void reload()}>Tentar novamente</Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Semana livre"
          description="Não há atendimentos neste período."
          action={
            <Button
              onClick={() => {
                setPanel(true);
              }}
            >
              Agendar atendimento
            </Button>
          }
        />
      ) : (
        <div className={styles.timeline}>
          {items.map((item) => (
            <article key={item.id} className={styles.slot}>
              <time dateTime={item.startsAt}>
                {new Date(item.startsAt).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
              <div>
                <h2>{item.patientName}</h2>
                <p>
                  {new Date(item.startsAt).toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'short',
                  })}
                </p>
              </div>
              <Badge>{statusLabel[item.status]}</Badge>
            </article>
          ))}
        </div>
      )}
      <RightPanel
        open={panel}
        title="Novo agendamento"
        description="Conflitos de horário são bloqueados pelo backend local."
        onClose={() => {
          setPanel(false);
        }}
      >
        <AppointmentForm
          onSubmit={async (input) => {
            await create(input);
            setPanel(false);
          }}
        />
      </RightPanel>
    </section>
  );
}
