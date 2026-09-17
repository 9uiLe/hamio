import {
  type Answers,
  type Field,
  type FormDefinition,
  type FormResponse,
  type Issue,
  limits,
} from "./contract.ts";

export function answerIssue(field: Field, value: unknown): Issue | undefined {
  const issue = (code: Issue["code"], message: string): Issue => ({
    field: field.id,
    code,
    message,
  });
  switch (field.kind) {
    case "text":
    case "secret": {
      if (typeof value !== "string") return issue("TYPE", "A string is required.");
      if (field.required && value.length === 0) return issue("REQUIRED", "A value is required.");
      const length = Array.from(value).length;
      if (
        length < field.minLength ||
        length > field.maxLength ||
        Buffer.byteLength(value) > limits.stringBytes
      )
        return issue("LENGTH", "The value is outside the allowed length.");
      return;
    }
    case "confirm":
      return typeof value === "boolean" ? undefined : issue("TYPE", "A boolean is required.");
    case "select":
      if (typeof value !== "string") return issue("TYPE", "A choice value is required.");
      return field.options.some((option) => option.value === value)
        ? undefined
        : issue("CHOICE", "Choose a listed option.");
    case "multiselect":
      if (!Array.isArray(value) || !value.every((item) => typeof item === "string"))
        return issue("TYPE", "An array of choice values is required.");
      if (field.required && value.length === 0)
        return issue("REQUIRED", "Choose at least one option.");
      if (new Set(value).size !== value.length)
        return issue("DUPLICATE", "Repeated choices are not allowed.");
      return value.every((item) => field.options.some((option) => option.value === item))
        ? undefined
        : issue("CHOICE", "Choose listed options.");
  }
}

export function resolveForm(form: FormDefinition, supplied: Record<string, unknown>) {
  const values: Answers = {};
  const missing: Field[] = [];
  const issues: Issue[] = [];
  const ids = new Set(form.fields.map((field) => field.id));
  // Do not reflect an arbitrary input key in diagnostics.
  if (Object.keys(supplied).some((id) => !ids.has(id)))
    issues.push({ field: "", code: "UNKNOWN_FIELD", message: "Values contain an unknown field." });
  for (const field of form.fields) {
    const value = Object.hasOwn(supplied, field.id) ? supplied[field.id] : field.default;
    if (value === undefined) {
      if (field.required) missing.push(field);
      continue;
    }
    const issue = answerIssue(field, value);
    if (issue) issues.push(issue);
    else if (
      typeof value === "string" ||
      typeof value === "boolean" ||
      (Array.isArray(value) && value.every((item): item is string => typeof item === "string"))
    )
      values[field.id] = value;
  }
  return { values, missing, issues };
}

export function formResponse(
  form: FormDefinition,
  supplied: Record<string, unknown>,
): FormResponse {
  const { values, missing, issues } = resolveForm(form, supplied);
  if (issues.length) return { apiVersion: 1, status: "invalid_values", id: form.id, issues };
  if (missing.length)
    return {
      apiVersion: 1,
      status: "needs_input",
      id: form.id,
      missing: missing.map((field) => field.id),
    };
  return { apiVersion: 1, status: "ok", id: form.id, values };
}
