import { version } from "../../package.json";

export const API_VERSION = 1;
export const VERSION = version;
export const limits = {
  documentBytes: 256 * 1024,
  frameBytes: 64 * 1024,
  depth: 16,
  nodes: 20_000,
  stringBytes: 4096,
  fields: 64,
  options: 100,
  blocks: 32,
  columns: 16,
  rows: 200,
  activeTasks: 100,
  totalTasks: 10_000,
  warnings: 100,
  outputTimeoutMs: 5000,
} as const;

export type Scalar = string | number | boolean | null;
export type JsonValue = Scalar | JsonValue[] | { [key: string]: JsonValue };
export type Answer = string | boolean | string[];
export type Answers = Record<string, Answer>;
export type Level = "info" | "success" | "warning" | "error";
export interface Choice {
  value: string;
  label: string;
}
interface FieldBase {
  id: string;
  label: string;
  description?: string;
  required: boolean;
  default?: Answer;
}
export type Field = FieldBase &
  (
    | { kind: "text" | "secret"; minLength: number; maxLength: number }
    | { kind: "confirm" }
    | { kind: "select" | "multiselect"; options: Choice[] }
  );
export interface FormDefinition {
  apiVersion: 1;
  id: string;
  title?: string;
  fields: Field[];
}
export interface Issue {
  field: string;
  code: "TYPE" | "REQUIRED" | "LENGTH" | "CHOICE" | "DUPLICATE" | "UNKNOWN_FIELD";
  message: string;
}
export interface Result {
  success: boolean;
  message?: string;
  data?: JsonValue;
}
export type Block =
  | { kind: "message"; level: Level; text: string }
  | { kind: "key-value"; items: { label: string; value: Scalar; secret: boolean }[] }
  | {
      kind: "table";
      columns: { id: string; label: string; secret: boolean }[];
      rows: Record<string, Scalar>[];
    }
  | { kind: "progress"; label: string; current: number; total: number }
  | ({ kind: "result" } & Result)
  | { kind: "error"; code: string; message: string };
export interface DisplayDefinition {
  apiVersion: 1;
  blocks: Block[];
}
interface EventBase {
  apiVersion: 1;
  runId: string;
  seq: number;
}
export type Event = EventBase &
  (
    | { type: "run.start"; title: string }
    | { type: "task.start"; taskId: string; label: string }
    | { type: "task.progress"; taskId: string; current: number; total: number }
    | { type: "task.finish"; taskId: string; status: "succeeded" | "failed" }
    | { type: "message"; level: Level; text: string }
    | { type: "run.finish"; result: Result }
  );
export type FormResponse =
  | { apiVersion: 1; status: "ok"; id: string; values: Answers }
  | { apiVersion: 1; status: "needs_input"; id: string; missing: string[] }
  | { apiVersion: 1; status: "invalid_values"; id: string; issues: Issue[] }
  | { apiVersion: 1; status: "cancelled" };
export type ErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_JSON"
  | "UNSUPPORTED_VERSION"
  | "INVALID_REQUEST"
  | "PROTOCOL_ERROR"
  | "LIMIT_EXCEEDED"
  | "IO_ERROR"
  | "UI_ERROR";
const exitCodes: Record<ErrorCode, number> = {
  INVALID_ARGUMENT: 2,
  INVALID_JSON: 2,
  UNSUPPORTED_VERSION: 2,
  INVALID_REQUEST: 2,
  PROTOCOL_ERROR: 5,
  LIMIT_EXCEEDED: 6,
  IO_ERROR: 7,
  UI_ERROR: 7,
};
export class ContractError extends Error {
  readonly exitCode: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.exitCode = exitCodes[code];
  }
}
export class Cancelled extends Error {}
export function invalid(message = "Input does not match the API contract."): never {
  throw new ContractError("INVALID_REQUEST", message);
}
export function limited(message: string): never {
  throw new ContractError("LIMIT_EXCEEDED", message);
}
