/* eslint-disable @typescript-eslint/unbound-method -- Os métodos são spies estáticos do módulo mockado pelo Vitest. */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuthSession } from './useAuthSession';
import { authService } from '../services/auth.service';

vi.mock('../services/auth.service', () => ({
  authService: {
    login: vi.fn(),
    bootstrapAdmin: vi.fn(),
    logout: vi.fn(),
    getSessionPolicy: vi.fn(),
    needsBootstrap: vi.fn(),
  },
}));

const session = {
  token: 'token-test',
  expiresAt: '2026-11-02T20:00:00Z',
  user: {
    id: 'u1',
    displayName: 'Responsável',
    username: 'owner',
    role: 'owner' as const,
    status: 'active',
    createdAt: '2026-11-02T10:00:00Z',
  },
};

function Probe() {
  const { session: current, login } = useAuthSession();
  return (
    <button type="button" onClick={() => void login({ username: 'owner', password: 'SenhaForte123' })}>
      {current ? 'Sessão ativa' : 'Entrar'}
    </button>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(authService.login).mockResolvedValue(session);
    vi.mocked(authService.getSessionPolicy).mockResolvedValue({
      value: { autoLockMinutes: 1 },
    });
    vi.mocked(authService.logout).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('encerra a sessão após o tempo configurado de inatividade', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Sessão ativa' })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(authService.logout).toHaveBeenCalledWith('token-test');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('reinicia o relógio quando há atividade', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40_000);
      fireEvent.keyDown(window, { key: 'Tab' });
      await vi.advanceTimersByTimeAsync(40_000);
    });
    expect(authService.logout).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(authService.logout).toHaveBeenCalledTimes(1);
  });

  it('bloqueia imediatamente quando o backend invalida a sessão', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => {
      window.dispatchEvent(new Event('psicodesk:session-invalid'));
    });
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });
});
