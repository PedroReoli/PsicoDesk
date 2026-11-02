import { useState, type SyntheticEvent } from 'react';
import { Button } from '../../../design-system/primitives/Button';
import { Input } from '../../../design-system/primitives/Input';
import {
  formatCurrency,
  parseCurrencyToMinor,
  type PaymentInput,
  type PaymentMethod,
} from '../types/finance.types';
import styles from '../styles/finance.module.css';

const methods: { value: PaymentMethod; label: string }[] = [
  { value: 'pix', label: 'Pix' },
  { value: 'card', label: 'Cartão' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'transfer', label: 'Transferência' },
  { value: 'other', label: 'Outro' },
];

export function PaymentForm({
  balanceMinor,
  onSubmit,
}: {
  balanceMinor: number;
  onSubmit: (input: PaymentInput) => Promise<void>;
}) {
  const [amount, setAmount] = useState((balanceMinor / 100).toFixed(2).replace('.', ','));
  const [method, setMethod] = useState<PaymentMethod>('pix');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountMinor = parseCurrencyToMinor(amount);
    if (amountMinor <= 0 || amountMinor > balanceMinor) {
      setError(`Informe um valor entre R$ 0,01 e ${formatCurrency(balanceMinor)}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ amountMinor, method, paidAt: new Date(paidAt).toISOString() });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao registrar recebimento.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <Input
        label="Valor recebido"
        value={amount}
        onChange={(event) => {
          setAmount(event.target.value);
        }}
        inputMode="decimal"
        required
      />
      <Input
        label="Data e hora"
        type="datetime-local"
        value={paidAt}
        onChange={(event) => {
          setPaidAt(event.target.value);
        }}
        required
      />
      <fieldset className={styles.methodPicker}>
        <legend>Forma de pagamento</legend>
        <div role="radiogroup" aria-label="Forma de pagamento">
          {methods.map((item) => (
            <Button
              key={item.value}
              type="button"
              variant={method === item.value ? 'primary' : 'ghost'}
              role="radio"
              aria-checked={method === item.value}
              onClick={() => {
                setMethod(item.value);
              }}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <Button type="submit" loading={busy} fullWidth>
        Confirmar recebimento
      </Button>
    </form>
  );
}
