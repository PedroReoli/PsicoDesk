import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RightPanel } from './RightPanel';

describe('RightPanel', () => {
  it('usa uma região lateral sem semântica de dialog', () => {
    render(
      <RightPanel open title="Novo paciente">
        Conteúdo
      </RightPanel>,
    );

    expect(screen.getByRole('complementary', { name: 'Novo paciente' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('expõe fechamento por botão rotulado', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <RightPanel open title="Novo paciente" onClose={onClose}>
        Conteúdo
      </RightPanel>,
    );

    await user.click(screen.getByRole('button', { name: 'Fechar Novo paciente' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
