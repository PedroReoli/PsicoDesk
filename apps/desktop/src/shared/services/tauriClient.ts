import { invoke } from '@tauri-apps/api/core';

export class LocalCommandError extends Error {
  constructor(
    message: string,
    readonly code = 'LOCAL_COMMAND_FAILED',
  ) {
    super(message);
    this.name = 'LocalCommandError';
  }
}

export async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    if (error instanceof Error) {
      throw new LocalCommandError(error.message);
    }

    throw new LocalCommandError('A operação local não pôde ser concluída.');
  }
}

