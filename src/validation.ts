import {
  type Answer,
  type Block,
  ContractError,
  type DisplayDefinition,
  type Event,
  type Field,
  type FormDefinition,
  invalid,
  type JsonValue,
  type Level,
  limited,
  limits,
  type Result,
  type Scalar,
} from "./contract.ts";
import { answerIssue } from "./form.ts";

export function validateTree(value: unknown): asserts value is JsonValue {
  let nodes = 0;
  function visit(item: unknown, depth: number): void {
    if (++nodes > limits.nodes || depth > limits.depth)
      limited("JSON structure exceeds its limit.");
    if (typeof item === "string") {
      if (Buffer.byteLength(item) > limits.stringBytes) limited("A string exceeds its byte limit.");
      // Reject lone UTF-16 surrogates rather than changing their encoded value.
      if (!item.isWellFormed()) invalid("Strings must contain valid Unicode.");
    } else if (typeof item === "number") {
      if (!Number.isFinite(item) || (Number.isInteger(item) && !Number.isSafeInteger(item)))
        invalid("Numbers must be finite and integers must be safe.");
    } else if (Array.isArray(item)) {
      for (const child of item) visit(child, depth + 1);
    } else if (item !== null && typeof item === "object") {
      for (const [key, child] of Object.entries(item)) {
        if (["__proto__", "prototype", "constructor"].includes(key))
          invalid("A reserved key was used.");
        visit(key, depth + 1);
        visit(child, depth + 1);
      }
    } else if (item !== null && typeof item !== "boolean") invalid();
  }
  visit(value, 0);
}
export function parseJson(text: string): JsonValue {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ContractError("INVALID_JSON", "Input is not valid JSON.");
  }
  validateTree(value);
  return value;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function record(value: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) invalid("An object is required.");
  if (keys && Object.keys(value).some((key) => !keys.includes(key)))
    invalid("An unknown property was provided.");
  return value;
}
function string(value: unknown): string {
  if (typeof value !== "string") invalid("A string is required.");
  return value;
}
function id(value: unknown): string {
  const text = string(value);
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(text) ||
    ["__proto__", "prototype", "constructor"].includes(text)
  )
    invalid("An identifier is invalid.");
  return text;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") invalid("A boolean is required.");
  return value;
}
function number(value: unknown, minimum = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum)
    invalid("A numeric value is out of range.");
  return value;
}
function integer(value: unknown, maximum: number): number {
  const result = number(value);
  if (!Number.isSafeInteger(result) || result > maximum) invalid("An integer is out of range.");
  return result;
}
function array(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value)) invalid("An array is required.");
  if (value.length > maximum) limited("An array exceeds its item limit.");
  return value;
}
function nonempty<T>(values: T[]): T[] {
  if (!values.length) invalid("At least one item is required.");
  return values;
}
function unique(values: string[]) {
  if (new Set(values).size !== values.length)
    invalid("Identifiers or choice values must be unique.");
}
function version(value: unknown): 1 {
  if (value !== 1) throw new ContractError("UNSUPPORTED_VERSION", "Use apiVersion 1.");
  return value;
}
function scalar(value: unknown): Scalar {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;
  return invalid("A scalar value is required.");
}
function answer(value: unknown): Answer {
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (Array.isArray(value) && value.every((item): item is string => typeof item === "string"))
    return value;
  return invalid("The default is not a supported answer type.");
}
function level(value: unknown): Level {
  if (value === "info" || value === "success" || value === "warning" || value === "error")
    return value;
  return invalid("A message level is invalid.");
}
function progress(obj: Record<string, unknown>) {
  const current = number(obj.current);
  const total = number(obj.total);
  if (total <= 0 || current > total) invalid("Progress must be between zero and a positive total.");
  return { current, total };
}
function result(value: unknown): Result {
  const obj = record(value, ["success", "message", "data"]);
  const data = obj.data;
  if (data !== undefined) validateTree(data);
  return {
    success: boolean(obj.success),
    ...(obj.message === undefined ? {} : { message: string(obj.message) }),
    ...(data === undefined ? {} : { data }),
  };
}
function field(value: unknown): Field {
  const obj = record(value);
  const common = ["id", "kind", "label", "description", "required", "default"];
  const base = {
    id: id(obj.id),
    label: string(obj.label),
    required: obj.required === undefined ? true : boolean(obj.required),
    ...(obj.description === undefined ? {} : { description: string(obj.description) }),
    ...(obj.default === undefined ? {} : { default: answer(obj.default) }),
  };
  let parsed: Field;
  switch (obj.kind) {
    case "text":
    case "secret": {
      record(obj, [...common, "minLength", "maxLength"]);
      const minLength =
        obj.minLength === undefined ? 0 : integer(obj.minLength, limits.stringBytes);
      const maxLength =
        obj.maxLength === undefined
          ? limits.stringBytes
          : integer(obj.maxLength, limits.stringBytes);
      if (minLength > maxLength || (obj.kind === "secret" && obj.default !== undefined))
        invalid("Length constraints or a secret default are invalid.");
      parsed = { ...base, kind: obj.kind, minLength, maxLength };
      break;
    }
    case "confirm":
      record(obj, common);
      parsed = { ...base, kind: "confirm" };
      break;
    case "select":
    case "multiselect": {
      record(obj, [...common, "options"]);
      const options = nonempty(array(obj.options, limits.options)).map((option) => {
        const choice = record(option, ["value", "label"]);
        return { value: string(choice.value), label: string(choice.label) };
      });
      unique(options.map((option) => option.value));
      parsed = { ...base, kind: obj.kind, options };
      break;
    }
    default:
      return invalid("The field kind is unsupported.");
  }
  if (parsed.default !== undefined && answerIssue(parsed, parsed.default))
    invalid("A default does not satisfy its field constraints.");
  return parsed;
}
export function formDefinition(value: unknown): FormDefinition {
  validateTree(value);
  const obj = record(value, ["apiVersion", "id", "title", "fields"]);
  const apiVersion = version(obj.apiVersion);
  const fields = nonempty(array(obj.fields, limits.fields)).map(field);
  unique(fields.map((field) => field.id));
  return {
    apiVersion,
    id: id(obj.id),
    ...(obj.title === undefined ? {} : { title: string(obj.title) }),
    fields,
  };
}
function block(value: unknown): Block {
  const obj = record(value);
  switch (obj.kind) {
    case "message":
      record(obj, ["kind", "level", "text"]);
      return { kind: "message", level: level(obj.level), text: string(obj.text) };
    case "key-value":
      record(obj, ["kind", "items"]);
      return {
        kind: "key-value",
        items: array(obj.items, limits.rows).map((item) => {
          const pair = record(item, ["label", "value", "secret"]);
          return {
            label: string(pair.label),
            value: scalar(pair.value),
            secret: pair.secret === undefined ? false : boolean(pair.secret),
          };
        }),
      };
    case "table": {
      record(obj, ["kind", "columns", "rows"]);
      const columns = nonempty(array(obj.columns, limits.columns)).map((column) => {
        const c = record(column, ["id", "label", "secret"]);
        return {
          id: id(c.id),
          label: string(c.label),
          secret: c.secret === undefined ? false : boolean(c.secret),
        };
      });
      const keys = columns.map((column) => column.id);
      unique(keys);
      const rows = array(obj.rows, limits.rows).map((row) => {
        const r = record(row, keys);
        return Object.fromEntries(keys.map((key) => [key, scalar(r[key])]));
      });
      return { kind: "table", columns, rows };
    }
    case "progress":
      record(obj, ["kind", "label", "current", "total"]);
      return { kind: "progress", label: string(obj.label), ...progress(obj) };
    case "result": {
      const { kind: _, ...data } = obj;
      return { kind: "result", ...result(data) };
    }
    case "error":
      record(obj, ["kind", "code", "message"]);
      return { kind: "error", code: id(obj.code), message: string(obj.message) };
    default:
      return invalid("The display kind is unsupported.");
  }
}
export function displayDefinition(value: unknown): DisplayDefinition {
  validateTree(value);
  const obj = record(value, ["apiVersion", "blocks"]);
  return {
    apiVersion: version(obj.apiVersion),
    blocks: array(obj.blocks, limits.blocks).map(block),
  };
}
export function eventDefinition(value: unknown): Event {
  validateTree(value);
  const obj = record(value);
  const base = {
    apiVersion: version(obj.apiVersion),
    runId: id(obj.runId),
    seq: integer(obj.seq, Number.MAX_SAFE_INTEGER),
  };
  const common = ["apiVersion", "runId", "seq", "type"];
  switch (obj.type) {
    case "run.start":
      record(obj, [...common, "title"]);
      return { ...base, type: "run.start", title: string(obj.title) };
    case "task.start":
      record(obj, [...common, "taskId", "label"]);
      return { ...base, type: "task.start", taskId: id(obj.taskId), label: string(obj.label) };
    case "task.progress":
      record(obj, [...common, "taskId", "current", "total"]);
      return { ...base, type: "task.progress", taskId: id(obj.taskId), ...progress(obj) };
    case "task.finish":
      record(obj, [...common, "taskId", "status"]);
      if (obj.status !== "succeeded" && obj.status !== "failed")
        invalid("The task status is unsupported.");
      return { ...base, type: "task.finish", taskId: id(obj.taskId), status: obj.status };
    case "message":
      record(obj, [...common, "level", "text"]);
      return { ...base, type: "message", level: level(obj.level), text: string(obj.text) };
    case "run.finish":
      record(obj, [...common, "result"]);
      return { ...base, type: "run.finish", result: result(obj.result) };
    default:
      return invalid("The event type is unsupported.");
  }
}
