import { stateError, stateLimit } from "./error.ts";
import { stateLimits } from "./limits.ts";
import type {
  Cell,
  ContentItem,
  DataPresence,
  PresentationState,
  ProgressState,
  Result,
  RunState,
  SourceExtent,
  StructuredValue,
  Task,
  TaskState,
  TreeNode,
} from "./model.ts";

function nonempty(value: string, name: string): void {
  if (typeof value !== "string" || value.length === 0) stateError(`${name} must not be empty.`);
}

function safeNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
    stateError(`${name} must be finite and safe.`);
}

function structured(
  value: StructuredValue,
  seen = new WeakSet<object>(),
  count = { nodes: 0 },
  depth = 0,
): void {
  if (++count.nodes > stateLimits.structuredNodes)
    stateLimit("Structured data node limit exceeded.");
  if (depth > stateLimits.structuredDepth) stateLimit("Structured data depth limit exceeded.");
  if (typeof value === "number") safeNumber(value, "Structured number");
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "number"
  )
    return;
  if (typeof value !== "object") stateError("Structured data is not a JSON value.");
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    stateError("Structured data must be a plain object.");
  if (seen.has(value)) stateError("Structured data contains a cycle.");
  seen.add(value);
  if (Array.isArray(value)) {
    for (const child of value) structured(child, seen, count, depth + 1);
  } else {
    for (const [key, child] of Object.entries(value)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype")
        stateError("Structured data contains a reserved key.");
      structured(child, seen, count, depth + 1);
    }
  }
  seen.delete(value);
}

function data(value: DataPresence): void {
  if (!value || typeof value !== "object") stateError("Data presence is required.");
  if (value.kind === "value") structured(value.value);
  else if (value.kind !== "none") stateError("Data presence is invalid.");
}

export function validateResult(result: Result): void {
  switch (result.kind) {
    case "succeeded":
      data(result.data);
      return;
    case "failed":
      if (!result.failure) stateError("Failed result requires Failure.");
      nonempty(result.failure.code, "Failure code");
      nonempty(result.failure.message, "Failure message");
      data(result.failure.details);
      return;
    case "cancelled":
      return;
    default:
      stateError("Result kind is invalid.");
  }
}

export function validateProgress(progress: ProgressState): void {
  switch (progress.kind) {
    case "none":
    case "indeterminate":
      return;
    case "determinate":
      if (
        !Number.isSafeInteger(progress.current) ||
        !Number.isSafeInteger(progress.total) ||
        progress.total <= 0 ||
        progress.current < 0 ||
        progress.current > progress.total
      )
        stateError("Determinate progress must satisfy 0 <= current <= positive total.");
      return;
    default:
      stateError("Progress kind is invalid.");
  }
}

function extent(value: SourceExtent): void {
  if (value.kind === "complete") return;
  if (value.kind !== "truncated") stateError("Source extent is invalid.");
  if (
    value.omittedCount !== undefined &&
    (!Number.isSafeInteger(value.omittedCount) || value.omittedCount <= 0)
  )
    stateError("Known omitted count must be a positive safe integer.");
}

function cell(value: Cell): void {
  if (value.kind === "redacted") return;
  if (value.kind !== "visible") stateError("Cell visibility is invalid.");
  if (value.value !== null && !["string", "boolean", "number"].includes(typeof value.value))
    stateError("Visible cell requires a scalar.");
  if (typeof value.value === "number") safeNumber(value.value, "Cell number");
}

function tree(
  nodes: readonly TreeNode[],
  depth: number,
  seen: WeakSet<object>,
  count: { nodes: number },
): void {
  if (nodes.length > 0 && depth > stateLimits.treeDepth) stateLimit("Tree depth limit exceeded.");
  for (const node of nodes) {
    if (++count.nodes > stateLimits.treeNodes) stateLimit("Tree node limit exceeded.");
    if (seen.has(node)) stateError("Tree contains a cycle.");
    seen.add(node);
    nonempty(node.label, "Tree label");
    tree(node.children, depth + 1, seen, count);
    seen.delete(node);
  }
}

export function validateContent(item: ContentItem): void {
  switch (item.kind) {
    case "message":
      if (!["info", "success", "warning", "error"].includes(item.level))
        stateError("Message level is invalid.");
      nonempty(item.text, "Message text");
      return;
    case "progress":
      nonempty(item.label, "Progress label");
      validateProgress(item.progress);
      return;
    case "result":
      validateResult(item.result);
      return;
    case "failure":
      validateResult({ kind: "failed", failure: item.failure });
      return;
    case "table": {
      if (item.columns.length === 0 || item.columns.length > stateLimits.columns)
        stateLimit("Table column limit exceeded or no columns provided.");
      if (item.rows.length > stateLimits.rows) stateLimit("Table row limit exceeded.");
      const keys = new Set<string>();
      for (const column of item.columns) {
        nonempty(column.key, "Column key");
        nonempty(column.label, "Column label");
        if (keys.has(column.key)) stateError("Table column keys must be unique.");
        keys.add(column.key);
      }
      for (const row of item.rows) {
        if (row.length !== item.columns.length) stateError("Table row width differs from columns.");
        for (const value of row) cell(value);
      }
      extent(item.extent);
      return;
    }
    case "key-value": {
      const keys = new Set<string>();
      for (const entry of item.entries) {
        nonempty(entry.key, "Entry key");
        nonempty(entry.label, "Entry label");
        if (keys.has(entry.key)) stateError("Key-value keys must be unique.");
        keys.add(entry.key);
        cell(entry.value);
      }
      return;
    }
    case "code":
    case "diff":
      extent(item.extent);
      return;
    case "tree":
      extent(item.extent);
      tree(item.nodes, 0, new WeakSet<object>(), { nodes: 0 });
      return;
    case "summary":
      nonempty(item.headline, "Summary headline");
      return;
    case "redacted":
      return;
    default:
      stateError("Content kind is invalid.");
  }
}

function isResult(state: RunState | TaskState): state is Result {
  return state.kind === "succeeded" || state.kind === "failed" || state.kind === "cancelled";
}

export function validateState(state: PresentationState): void {
  if (state.items.length > stateLimits.items) stateLimit("Presentation item limit exceeded.");
  const ids = new Set<string>();
  let tasks = 0;
  let active = 0;
  let items = 0;
  if (state.run.kind !== "none" && state.run.kind !== "present")
    stateError("Run presence is invalid.");
  const run = state.run.kind === "present" ? state.run.value : undefined;
  if (run) {
    nonempty(run.id, "Run ID");
    nonempty(run.title, "Run title");
    if (isResult(run.state)) validateResult(run.state);
    else if (run.state.kind !== "running") stateError("Run state is invalid.");
  }
  function task(value: Task): void {
    if (!run) stateError("Task requires a run.");
    if (value.kind !== "task") stateError("Task kind is invalid.");
    nonempty(value.id, "Task ID");
    nonempty(value.label, "Task label");
    if (ids.has(value.id)) stateError("Task or group ID is duplicated.");
    ids.add(value.id);
    tasks++;
    if (tasks > stateLimits.tasks) stateLimit("Task limit exceeded.");
    if (value.state.kind === "running") {
      active++;
      if (active > stateLimits.activeTasks) stateLimit("Active task limit exceeded.");
      validateProgress(value.state.progress);
    } else if (isResult(value.state)) validateResult(value.state);
    else if (value.state.kind !== "pending") stateError("Task state is invalid.");
    if (run && isResult(run.state) && !isResult(value.state))
      stateError("Terminal run contains an unfinished task.");
  }
  for (const item of state.items) {
    items++;
    if (items > stateLimits.items) stateLimit("Presentation item limit exceeded.");
    if (item.kind === "task") task(item);
    else if (item.kind === "task-group") {
      if (!run) stateError("Task group requires a run.");
      nonempty(item.id, "Task group ID");
      nonempty(item.label, "Task group label");
      if (ids.has(item.id)) stateError("Task or group ID is duplicated.");
      ids.add(item.id);
      for (const child of item.tasks) {
        items++;
        if (items > stateLimits.items) stateLimit("Presentation item limit exceeded.");
        task(child);
      }
    } else validateContent(item);
  }
}
