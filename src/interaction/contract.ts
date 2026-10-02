export const formLimits = {
  documentBytes: 256 * 1024,
  depth: 16,
  nodes: 20_000,
  stringBytes: 4096,
  fields: 64,
  options: 100,
} as const;

export type Scalar = string | number | boolean | null;
export type JsonValue = Scalar | JsonValue[] | { [key: string]: JsonValue };
export type Answer = string | boolean | string[];
export type Answers = Record<string, Answer>;
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
export type FormResponse =
  | { apiVersion: 1; status: "ok"; id: string; values: Answers }
  | { apiVersion: 1; status: "needs_input"; id: string; missing: string[] }
  | { apiVersion: 1; status: "invalid_values"; id: string; issues: Issue[] }
  | { apiVersion: 1; status: "cancelled" };
