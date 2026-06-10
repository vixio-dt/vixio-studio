export type Result<TValue, TError = AppError> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly error: TError };

export type AppError = {
  readonly code:
    | "provider-not-configured"
    | "provider-request-failed"
    | "provider-response-invalid"
    | "generation-cancelled"
    | "storage-failed"
    | "not-found";
  readonly message: string;
  readonly cause?: unknown;
};

export const ok = <TValue>(value: TValue): Result<TValue, never> => ({
  ok: true,
  value,
});

export const err = <TError>(error: TError): Result<never, TError> => ({
  ok: false,
  error,
});

export const appError = (
  code: AppError["code"],
  message: string,
  cause?: unknown,
): AppError => ({ code, message, cause });

/** Narrows unknown thrown values into a readable message. */
export const messageFromUnknown = (cause: unknown): string => {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "string") return cause;
  return "Unknown error";
};
