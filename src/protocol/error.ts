export type ProtocolErrorCode =
  | "INVALID_UTF8"
  | "INVALID_JSON"
  | "UNSUPPORTED_VERSION"
  | "INVALID_SHAPE"
  | "LIMIT_EXCEEDED";

export class ProtocolError extends Error {
  constructor(
    readonly code: ProtocolErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function shape(message: string): never {
  throw new ProtocolError("INVALID_SHAPE", message);
}

export function limit(message: string): never {
  throw new ProtocolError("LIMIT_EXCEEDED", message);
}
