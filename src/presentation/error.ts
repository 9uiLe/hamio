export type PresentationErrorCode = "INVALID_STATE" | "INVALID_TRANSITION" | "LIMIT_EXCEEDED";

export class PresentationError extends Error {
  constructor(
    readonly code: PresentationErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function stateError(message: string): never {
  throw new PresentationError("INVALID_STATE", message);
}

export function transitionError(message: string): never {
  throw new PresentationError("INVALID_TRANSITION", message);
}

export function stateLimit(message: string): never {
  throw new PresentationError("LIMIT_EXCEEDED", message);
}
