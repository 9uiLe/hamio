import { OperationError, invalid, limited } from "../application/error.ts";
import {
  type Answer,
  type Field,
  type FormDefinition,
  formLimits,
  type JsonValue,
} from "./contract.ts";
import { answerIssue } from "./form.ts";

const reservedKeys = ["__proto__", "prototype", "constructor"];
function rawRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function validateTree(value: unknown): asserts value is JsonValue {
  let nodes = 0;
  function visit(item: unknown, depth: number): void {
    if (++nodes > formLimits.nodes || depth > formLimits.depth)
      limited("JSON structure exceeds its limit.");
    if (typeof item === "string") {
      // A UTF-16 code unit needs at most three UTF-8 bytes. Small values cannot
      // exceed the byte limit; avoid rescanning every key in high-volume streams.
      if (
        item.length > formLimits.stringBytes / 3 &&
        Buffer.byteLength(item) > formLimits.stringBytes
      )
        limited("A string exceeds its byte limit.");
      // Reject lone UTF-16 surrogates rather than changing their encoded value.
      if (!item.isWellFormed()) invalid("Strings must contain valid Unicode.");
    } else if (typeof item === "number") {
      if (!Number.isFinite(item) || (Number.isInteger(item) && !Number.isSafeInteger(item)))
        invalid("Numbers must be finite and integers must be safe.");
    } else if (Array.isArray(item)) {
      for (const child of item) visit(child, depth + 1);
    } else if (rawRecord(item)) {
      for (const key in item) {
        if (!Object.hasOwn(item, key)) continue;
        if (reservedKeys.includes(key)) invalid("A reserved key was used.");
        visit(key, depth + 1);
        visit(item[key], depth + 1);
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
    throw new OperationError("INVALID_JSON", "Input is not valid JSON.");
  }
  validateTree(value);
  return value;
}

function isRecord(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: JsonValue | undefined, keys?: readonly string[]): Record<string, JsonValue> {
  if (!isRecord(value)) invalid("An object is required.");
  if (keys)
    for (const key of Object.keys(value)) {
      if (!keys.includes(key)) invalid("An unknown property was provided.");
    }
  return value;
}

function string(value: unknown): string {
  if (typeof value !== "string") invalid("A string is required.");
  return value;
}

function id(value: unknown): string {
  const text = string(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(text) || reservedKeys.includes(text))
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

function array(value: JsonValue | undefined, maximum: number): JsonValue[] {
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
  if (value !== 1) throw new OperationError("UNSUPPORTED_VERSION", "Use apiVersion 1.");
  return value;
}

function answer(value: unknown): Answer {
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (Array.isArray(value) && value.every((item): item is string => typeof item === "string"))
    return value;
  return invalid("The default is not a supported answer type.");
}

const fieldKeys = ["id", "kind", "label", "description", "required", "default"];
const textKeys = [...fieldKeys, "minLength", "maxLength"];
const choiceKeys = [...fieldKeys, "options"];

function field(value: JsonValue): Field {
  const obj = record(value);
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
      record(obj, textKeys);
      const minLength =
        obj.minLength === undefined ? 0 : integer(obj.minLength, formLimits.stringBytes);
      const maxLength =
        obj.maxLength === undefined
          ? formLimits.stringBytes
          : integer(obj.maxLength, formLimits.stringBytes);
      if (minLength > maxLength || (obj.kind === "secret" && obj.default !== undefined))
        invalid("Length constraints or a secret default are invalid.");
      parsed = { ...base, kind: obj.kind, minLength, maxLength };
      break;
    }
    case "confirm":
      record(obj, fieldKeys);
      parsed = { ...base, kind: "confirm" };
      break;
    case "select":
    case "multiselect": {
      record(obj, choiceKeys);
      const options = nonempty(array(obj.options, formLimits.options)).map((option) => {
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

function formDefinition(value: JsonValue): FormDefinition {
  const obj = record(value, ["apiVersion", "id", "title", "fields"]);
  const apiVersion = version(obj.apiVersion);
  const fields = nonempty(array(obj.fields, formLimits.fields)).map(field);
  unique(fields.map((field) => field.id));
  return {
    apiVersion,
    id: id(obj.id),
    ...(obj.title === undefined ? {} : { title: string(obj.title) }),
    fields,
  };
}

export function decodeForm(text: string): FormDefinition {
  return formDefinition(parseJson(text));
}

export function decodeValues(text: string) {
  return record(parseJson(text));
}
