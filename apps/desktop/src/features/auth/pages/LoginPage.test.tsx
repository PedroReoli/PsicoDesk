/* eslint-disable @typescript-eslint/unbound-method -- Os métodos são spies estáticos dos módulos mockados. */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';
import { authService } from '../services/auth.service';
import { useAuthSession } from '../hooks/useAuthSession';

vi.mock('../services/auth.service', () => ({
  authService: { needsBootstrap: vi.fn() },
}));
vi.mock('../hooks/useAuthSession', () => ({ useAuthSession: vi.fn() }));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.mocked(useAuthSession).mockReturnValue({
      session: null,
      busy: false,
      error: null,
      login: vi.fn(),
      bootstrap: vi.fn(),
      logout: vi.fn(),
    });
  });

  it('abre automaticamente o bootstrap quando o banco local está vazio', async () => {
    vi.mocked(authService.needsBootstrap).mockResolvedValue(true);
    render(<LoginPage />);
    expect(await screen.findByRole('heading', { name: 'Criar administrador local' })).toBeVisible();
    expect(screen.getByLabelText(/Nome de exibição/)).toBeRequired();
  });

  it('mostra erro de credencial sem revelar detalhes internos', async () => {
    vi.mocked(authService.needsBootstrap).mockResolvedValue(false);
    vi.mocked(useAuthSession).mockReturnValue({
      session: null,
      busy: false,
      error: 'Usuário ou senha inválidos.',
      login: vi.fn(),
      bootstrap: vi.fn(),
      logout: vi.fn(),
    });
    render(<LoginPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Usuário ou senha inválidos.');
  });
});
