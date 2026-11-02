export type ErrorCode = "BAD_REQUEST" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "RATE_LIMITED" | "DEPENDENCY_UNAVAILABLE" | "INTERNAL";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const errors = {
  badRequest: (message: string, details?: Record<string, unknown>) => new AppError("BAD_REQUEST", message, 400, details),
  unauthenticated: () => new AppError("UNAUTHENTICATED", "Autenticação necessária.", 401),
  forbidden: () => new AppError("FORBIDDEN", "Ação não permitida.", 403),
  notFound: () => new AppError("NOT_FOUND", "Recurso não encontrado.", 404),
  conflict: (message: string) => new AppError("CONFLICT", message, 409),
  unavailable: () => new AppError("DEPENDENCY_UNAVAILABLE", "Serviço temporariamente indisponível.", 503),
} as const;

