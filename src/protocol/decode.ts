import { stateLimits } from "../presentation/limits.ts";
import { PresentationError } from "../presentation/error.ts";
import { finishReplay, type ReplayResult } from "../presentation/replay.ts";
import { PresentationSession } from "../presentation/session.ts";
import type {
  Cell,
  ContentItem,
  DataPresence,
  Failure,
  PresentationEvent,
  PresentationItem,
  PresentationState,
  ProgressState,
  Result,
  RunState,
  Scalar,
  SourceExtent,
  StructuredValue,
  Task,
  TreeNode,
} from "../presentation/model.ts";
import { validateState } from "../presentation/validate.ts";
import { limit, ProtocolError, shape } from "./error.ts";
import { protocolLimits } from "./limits.ts";

const reserved = new Set(["__proto__", "prototype", "constructor"]);
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const encoder = new TextEncoder();

function byteLength(value: string): number {
  return encoder.encode(value).byteLength;
}

function source(input: string | Uint8Array, maximum: number): string {
  let text: string;
  if (typeof input === "string") {
    if (!input.isWellFormed()) shape("Input contains invalid Unicode.");
    text = input;
  } else {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(input);
    } catch {
      throw new ProtocolError("INVALID_UTF8", "Input is not UTF-8.");
    }
  }
  if (byteLength(text) > maximum) limit("Input byte limit exceeded.");
  return text;
}

function parse(input: string | Uint8Array, maximum: number): unknown {
  let value: unknown;
  try {
    value = JSON.parse(source(input, maximum));
  } catch (error) {
    if (error instanceof ProtocolError) throw error;
    throw new ProtocolError("INVALID_JSON", "Input is not valid JSON.");
  }
  let nodes = 0;
  function visit(current: unknown, depth: number): void {
    if (++nodes > protocolLimits.nodes || depth > protocolLimits.depth)
      limit("JSON structure exceeds its node or depth limit.");
    if (typeof current === "string") {
      if (!current.isWellFormed()) shape("String contains invalid Unicode.");
      if (byteLength(current) > protocolLimits.stringBytes) limit("String byte limit exceeded.");
    } else if (typeof current === "number") {
      if (
        !Number.isFinite(current) ||
        (Number.isInteger(current) && !Number.isSafeInteger(current))
      )
        shape("Number must be finite and integer values must be safe.");
    } else if (Array.isArray(current)) {
      for (const child of current) visit(child, depth + 1);
    } else if (current !== null && typeof current === "object") {
      for (const [key, child] of Object.entries(current)) {
        if (reserved.has(key)) shape("Reserved object key is not allowed.");
        if (!key.isWellFormed()) shape("Object key contains invalid Unicode.");
        if (byteLength(key) > protocolLimits.stringBytes) limit("Object key byte limit exceeded.");
        visit(child, depth + 1);
      }
    } else if (current !== null && typeof current !== "boolean") shape("JSON value is invalid.");
  }
  visit(value, 0);
  return value;
}

function object(value: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    shape("An object is required.");
  if (keys)
    for (const key of Object.keys(value))
      if (!keys.includes(key)) shape("Unknown property was provided.");
  return value as Record<string, unknown>;
}

function array(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value)) shape("An array is required.");
  if (value.length > maximum) limit("Array item limit exceeded.");
  return value;
}

function string(value: unknown): string {
  if (typeof value !== "string") shape("A string is required.");
  return value;
}

function id(value: unknown): string {
  const result = string(value);
  if (!idPattern.test(result) || reserved.has(result)) shape("Identifier is invalid.");
  return result;
}

function unsigned(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    shape("A non-negative safe integer is required.");
  return value;
}

function scalar(value: unknown): Scalar {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return value;
  return shape("A scalar is required.");
}

function data(value: unknown): DataPresence {
  const obj = object(value, ["kind", "value"]);
  if (obj.kind === "none") {
    object(value, ["kind"]);
    return { kind: "none" };
  }
  if (obj.kind === "value") {
    if (!Object.hasOwn(obj, "value")) shape("Data value is required.");
    return { kind: "value", value: obj.value as StructuredValue };
  }
  return shape("Data presence kind is invalid.");
}

function failure(value: unknown): Failure {
  const obj = object(value, ["code", "message", "details"]);
  return { code: id(obj.code), message: string(obj.message), details: data(obj.details) };
}

function result(value: unknown): Result {
  const obj = object(value, ["kind", "message", "data", "failure", "reason"]);
  switch (obj.kind) {
    case "succeeded":
      object(value, ["kind", "message", "data"]);
      return {
        kind: "succeeded",
        data: data(obj.data),
        ...(obj.message === undefined ? {} : { message: string(obj.message) }),
      };
    case "failed":
      object(value, ["kind", "failure"]);
      return { kind: "failed", failure: failure(obj.failure) };
    case "cancelled":
      object(value, ["kind", "reason"]);
      return {
        kind: "cancelled",
        ...(obj.reason === undefined ? {} : { reason: string(obj.reason) }),
      };
    default:
      return shape("Result kind is invalid.");
  }
}

function progress(value: unknown): ProgressState {
  const obj = object(value, ["kind", "current", "total"]);
  if (obj.kind === "none" || obj.kind === "indeterminate") {
    object(value, ["kind"]);
    return { kind: obj.kind };
  }
  if (obj.kind === "determinate") {
    return { kind: "determinate", current: unsigned(obj.current), total: unsigned(obj.total) };
  }
  return shape("Progress kind is invalid.");
}

function extent(value: unknown): SourceExtent {
  const obj = object(value, ["kind", "omittedCount"]);
  if (obj.kind === "complete") {
    object(value, ["kind"]);
    return { kind: "complete" };
  }
  if (obj.kind === "truncated")
    return {
      kind: "truncated",
      ...(obj.omittedCount === undefined ? {} : { omittedCount: unsigned(obj.omittedCount) }),
    };
  return shape("Source extent kind is invalid.");
}

function cell(value: unknown): Cell {
  const obj = object(value, ["kind", "value"]);
  if (obj.kind === "redacted") {
    object(value, ["kind"]);
    return { kind: "redacted" };
  }
  if (obj.kind === "visible") {
    if (!Object.hasOwn(obj, "value")) shape("Visible cell needs a value.");
    return { kind: "visible", value: scalar(obj.value) };
  }
  return shape("Cell visibility is invalid.");
}

function treeNode(value: unknown): TreeNode {
  const obj = object(value, ["label", "children"]);
  return {
    label: string(obj.label),
    children: array(obj.children, stateLimits.items).map(treeNode),
  };
}

function content(value: unknown): ContentItem {
  const obj = object(value);
  switch (obj.kind) {
    case "message":
      object(value, ["kind", "level", "text"]);
      if (!["info", "success", "warning", "error"].includes(obj.level as string))
        shape("Message level is invalid.");
      return {
        kind: "message",
        level: obj.level as "info" | "success" | "warning" | "error",
        text: string(obj.text),
      };
    case "progress":
      object(value, ["kind", "label", "progress"]);
      return { kind: "progress", label: string(obj.label), progress: progress(obj.progress) };
    case "result":
      object(value, ["kind", "result"]);
      return { kind: "result", result: result(obj.result) };
    case "failure":
      object(value, ["kind", "failure"]);
      return { kind: "failure", failure: failure(obj.failure) };
    case "table": {
      object(value, ["kind", "columns", "rows", "extent"]);
      const columns = array(obj.columns, stateLimits.columns).map((column) => {
        const c = object(column, ["key", "label"]);
        return { key: id(c.key), label: string(c.label) };
      });
      const rows = array(obj.rows, stateLimits.rows).map((row) =>
        array(row, stateLimits.columns).map(cell),
      );
      return { kind: "table", columns, rows, extent: extent(obj.extent) };
    }
    case "key-value":
      object(value, ["kind", "entries"]);
      return {
        kind: "key-value",
        entries: array(obj.entries, stateLimits.rows).map((entry) => {
          const e = object(entry, ["key", "label", "value"]);
          return { key: id(e.key), label: string(e.label), value: cell(e.value) };
        }),
      };
    case "code":
      object(value, ["kind", "text", "language", "extent"]);
      return {
        kind: "code",
        text: string(obj.text),
        extent: extent(obj.extent),
        ...(obj.language === undefined ? {} : { language: string(obj.language) }),
      };
    case "diff":
      object(value, ["kind", "lines", "source", "extent"]);
      return {
        kind: "diff",
        lines: array(obj.lines, stateLimits.rows).map((line) => {
          const l = object(line, ["kind", "text"]);
          if (l.kind !== "context" && l.kind !== "added" && l.kind !== "removed")
            shape("Diff line kind is invalid.");
          return { kind: l.kind, text: string(l.text) };
        }),
        extent: extent(obj.extent),
        ...(obj.source === undefined ? {} : { source: string(obj.source) }),
      };
    case "tree":
      object(value, ["kind", "nodes", "extent"]);
      return {
        kind: "tree",
        nodes: array(obj.nodes, stateLimits.items).map(treeNode),
        extent: extent(obj.extent),
      };
    case "summary":
      object(value, ["kind", "headline", "points"]);
      return {
        kind: "summary",
        headline: string(obj.headline),
        points: array(obj.points, stateLimits.rows).map(string),
      };
    case "redacted":
      object(value, ["kind"]);
      return { kind: "redacted" };
    default:
      return shape("Content kind is invalid.");
  }
}

function task(value: unknown): Task {
  const obj = object(value, ["kind", "id", "label", "state"]);
  if (obj.kind !== "task") shape("Task kind is invalid.");
  const stateObj = object(obj.state, ["kind", "progress", "message", "data", "failure", "reason"]);
  let state: Task["state"];
  if (stateObj.kind === "pending") {
    object(obj.state, ["kind"]);
    state = { kind: "pending" };
  } else if (stateObj.kind === "running") {
    object(obj.state, ["kind", "progress"]);
    state = { kind: "running", progress: progress(stateObj.progress) };
  } else state = result(obj.state);
  return { kind: "task", id: id(obj.id), label: string(obj.label), state };
}

function item(value: unknown): PresentationItem {
  const obj = object(value);
  if (obj.kind === "task") return task(value);
  if (obj.kind === "task-group") {
    object(value, ["kind", "id", "label", "tasks"]);
    return {
      kind: "task-group",
      id: id(obj.id),
      label: string(obj.label),
      tasks: array(obj.tasks, stateLimits.tasks).map(task),
    };
  }
  return content(value);
}

export function decodeStatic(input: string | Uint8Array): PresentationState {
  const document = object(parse(input, protocolLimits.documentBytes), ["protocolVersion", "state"]);
  if (document.protocolVersion !== 2)
    throw new ProtocolError("UNSUPPORTED_VERSION", "Use protocolVersion 2.");
  const raw = object(document.state, ["run", "items"]);
  const run = object(raw.run, ["kind", "value"]);
  let presence: PresentationState["run"];
  if (run.kind === "none") {
    object(raw.run, ["kind"]);
    presence = { kind: "none" };
  } else if (run.kind === "present") {
    const value = object(run.value, ["id", "title", "state"]);
    const rawState = object(value.state, ["kind", "message", "data", "failure", "reason"]);
    let state: RunState;
    if (rawState.kind === "running") {
      object(value.state, ["kind"]);
      state = { kind: "running" };
    } else state = result(value.state);
    presence = { kind: "present", value: { id: id(value.id), title: string(value.title), state } };
  } else return shape("Run presence kind is invalid.");
  const state: PresentationState = {
    run: presence,
    items: array(raw.items, stateLimits.items).map(item),
  };
  validateState(state);
  return state;
}

export function decodeEventLine(input: string | Uint8Array): PresentationEvent {
  const frame = object(parse(input, protocolLimits.frameBytes));
  if (frame.protocolVersion !== 2)
    throw new ProtocolError("UNSUPPORTED_VERSION", "Use protocolVersion 2.");
  const runId = id(frame.runId);
  const seq = unsigned(frame.seq);
  switch (frame.type) {
    case "run.started":
      object(frame, ["protocolVersion", "runId", "seq", "type", "title"]);
      return { type: "run.started", runId, seq, title: string(frame.title) };
    case "task-group.declared":
      object(frame, ["protocolVersion", "runId", "seq", "type", "groupId", "label"]);
      return {
        type: "task-group.declared",
        runId,
        seq,
        groupId: id(frame.groupId),
        label: string(frame.label),
      };
    case "task.declared": {
      object(frame, ["protocolVersion", "runId", "seq", "type", "taskId", "label", "placement"]);
      const raw = object(frame.placement, ["kind", "groupId"]);
      let placement: { kind: "root" } | { kind: "group"; groupId: string };
      if (raw.kind === "root") {
        object(frame.placement, ["kind"]);
        placement = { kind: "root" };
      } else if (raw.kind === "group") placement = { kind: "group", groupId: id(raw.groupId) };
      else return shape("Task placement kind is invalid.");
      return {
        type: "task.declared",
        runId,
        seq,
        taskId: id(frame.taskId),
        label: string(frame.label),
        placement,
      };
    }
    case "task.started":
      object(frame, ["protocolVersion", "runId", "seq", "type", "taskId"]);
      return { type: "task.started", runId, seq, taskId: id(frame.taskId) };
    case "task.progressed": {
      object(frame, ["protocolVersion", "runId", "seq", "type", "taskId", "progress"]);
      const next = progress(frame.progress);
      if (next.kind === "none") shape("Progress event cannot publish none.");
      return { type: "task.progressed", runId, seq, taskId: id(frame.taskId), progress: next };
    }
    case "task.finished":
      object(frame, ["protocolVersion", "runId", "seq", "type", "taskId", "result"]);
      return {
        type: "task.finished",
        runId,
        seq,
        taskId: id(frame.taskId),
        result: result(frame.result),
      };
    case "content.published":
      object(frame, ["protocolVersion", "runId", "seq", "type", "item"]);
      return { type: "content.published", runId, seq, item: content(frame.item) };
    case "run.finished":
      object(frame, ["protocolVersion", "runId", "seq", "type", "result"]);
      return { type: "run.finished", runId, seq, result: result(frame.result) };
    default:
      return shape("Event type is invalid.");
  }
}

export type WireReplayResult =
  | Exclude<ReplayResult, { kind: "invalid" }>
  | {
      kind: "invalid";
      acceptedPrefix: PresentationState;
      eventIndex: number;
      issue: ProtocolError | PresentationError;
    };

function* ndjsonLines(
  input: string | Uint8Array,
): Generator<{ line: string | Uint8Array; bytes: number }> {
  let start = 0;
  while (start < input.length) {
    const end = typeof input === "string" ? input.indexOf("\n", start) : input.indexOf(10, start);
    const line = input.slice(start, end === -1 ? input.length : end);
    const bytes =
      (typeof line === "string" ? byteLength(line) : line.byteLength) + (end === -1 ? 0 : 1);
    yield { line, bytes };
    if (end === -1) break;
    start = end + 1;
  }
}

export function replayNdjson(
  input: string | Uint8Array,
  recording: "complete" | "partial",
): WireReplayResult {
  const session = new PresentationSession();
  let index = 0;
  let bytes = 0;
  for (const frame of ndjsonLines(input)) {
    try {
      bytes += frame.bytes;
      if (bytes > protocolLimits.documentBytes) limit("NDJSON batch byte limit exceeded.");
      if (frame.line.length === 0) shape("Empty NDJSON frame is not allowed.");
      session.accept(decodeEventLine(frame.line));
    } catch (error) {
      if (!(error instanceof ProtocolError) && !(error instanceof PresentationError)) throw error;
      return {
        kind: "invalid",
        acceptedPrefix: session.snapshot(),
        eventIndex: index,
        issue: error,
      };
    }
    index++;
  }
  return finishReplay(session, recording, index);
}
