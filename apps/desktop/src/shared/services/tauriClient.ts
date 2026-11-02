import { invoke } from '@tauri-apps/api/core';

export const SESSION_INVALID_EVENT = 'psicodesk:session-invalid';

export class LocalCommandError extends Error {
  constructor(
    message: string,
    readonly code = 'LOCAL_COMMAND_FAILED',
  ) {
    super(message);
    this.name = 'LocalCommandError';
  }
}

export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    if (error instanceof Error) {
      throw new LocalCommandError(error.message, 'LOCAL_COMMAND_FAILED');
    }

    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof error.message === 'string'
    ) {
      const code =
        'code' in error && typeof error.code === 'string' ? error.code : 'LOCAL_COMMAND_FAILED';
      if (code === 'INVALID_SESSION' && typeof window !== 'undefined') {
        window.dispatchEvent(new Event(SESSION_INVALID_EVENT));
      }
      throw new LocalCommandError(error.message, code);
    }

    throw new LocalCommandError('A operação local não pôde ser concluída.');
  }
}
