export type OperationErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_JSON"
  | "UNSUPPORTED_VERSION"
  | "INVALID_REQUEST"
  | "LIMIT_EXCEEDED"
  | "IO_ERROR"
  | "UI_ERROR";

const exitCodes: Record<OperationErrorCode, number> = {
  INVALID_ARGUMENT: 2,
  INVALID_JSON: 2,
  UNSUPPORTED_VERSION: 2,
  INVALID_REQUEST: 2,
  LIMIT_EXCEEDED: 6,
  IO_ERROR: 7,
  UI_ERROR: 7,
};

export class OperationError extends Error {
  readonly exitCode: number;
  constructor(
    readonly code: OperationErrorCode,
    message: string,
  ) {
    super(message);
    this.exitCode = exitCodes[code];
  }
}

export class Cancelled extends Error {}

export function invalid(message = "Input does not match the API contract."): never {
  throw new OperationError("INVALID_REQUEST", message);
}

export function limited(message: string): never {
  throw new OperationError("LIMIT_EXCEEDED", message);
}
