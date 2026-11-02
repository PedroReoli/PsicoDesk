import { invoke } from '@tauri-apps/api/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invokeCommand, LocalCommandError } from './tauriClient';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

describe('invokeCommand', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserva mensagem e código seguros retornados pelo Rust', async () => {
    vi.mocked(invoke).mockRejectedValue({ code: 'CONFLICT', message: 'Horário indisponível.' });
    await expect(invokeCommand('create_appointment')).rejects.toMatchObject({
      name: 'LocalCommandError',
      code: 'CONFLICT',
      message: 'Horário indisponível.',
    } satisfies Partial<LocalCommandError>);
  });

  it('não expõe objetos de erro desconhecidos', async () => {
    vi.mocked(invoke).mockRejectedValue({ internal: 'sensitive' });
    await expect(invokeCommand('command')).rejects.toThrow(
      'A operação local não pôde ser concluída.',
    );
  });

  it('sinaliza expiração para bloquear a interface', async () => {
    const listener = vi.fn();
    window.addEventListener('psicodesk:session-invalid', listener, { once: true });
    vi.mocked(invoke).mockRejectedValue({
      code: 'INVALID_SESSION',
      message: 'Sua sessão expirou. Entre novamente.',
    });
    await expect(invokeCommand('list_patients')).rejects.toMatchObject({
      code: 'INVALID_SESSION',
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
