import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Button } from './Button';

describe('Button', () => {
  it('dispara a ação pelo teclado e pelo clique', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(<Button onClick={onClick}>Salvar</Button>);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('impede interação enquanto carrega', () => {
    render(<Button loading>Salvando</Button>);

    expect(screen.getByRole('button', { name: 'Salvando' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Salvando' })).toHaveAttribute('aria-busy', 'true');
  });
});
