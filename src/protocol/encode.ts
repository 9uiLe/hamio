import type { ContentItem, PresentationEvent, Result } from "../presentation/model.ts";

function result(value: Result): object {
  switch (value.kind) {
    case "succeeded":
      return {
        kind: value.kind,
        data: value.data,
        ...(value.message === undefined ? {} : { message: value.message }),
      };
    case "failed":
      return { kind: value.kind, failure: value.failure };
    case "cancelled":
      return { kind: value.kind, ...(value.reason === undefined ? {} : { reason: value.reason }) };
  }
}

function item(value: ContentItem): object {
  switch (value.kind) {
    case "message":
      return { kind: value.kind, level: value.level, text: value.text };
    case "progress":
      return { kind: value.kind, label: value.label, progress: value.progress };
    case "result":
      return { kind: value.kind, result: result(value.result) };
    case "failure":
      return { kind: value.kind, failure: value.failure };
    case "table":
      return { kind: value.kind, columns: value.columns, rows: value.rows, extent: value.extent };
    case "key-value":
      return { kind: value.kind, entries: value.entries };
    case "code":
      return {
        kind: value.kind,
        text: value.text,
        extent: value.extent,
        ...(value.language === undefined ? {} : { language: value.language }),
      };
    case "diff":
      return {
        kind: value.kind,
        lines: value.lines,
        extent: value.extent,
        ...(value.source === undefined ? {} : { source: value.source }),
      };
    case "tree":
      return { kind: value.kind, nodes: value.nodes, extent: value.extent };
    case "summary":
      return { kind: value.kind, headline: value.headline, points: value.points };
    case "redacted":
      return { kind: value.kind };
  }
}

/** Internal canonical boundary for accepted v2 events, not a public SDK. */
export function encodeEvent(event: PresentationEvent): string {
  const base = { protocolVersion: 2, runId: event.runId, seq: event.seq, type: event.type };
  let frame: object;
  switch (event.type) {
    case "run.started":
      frame = { ...base, title: event.title };
      break;
    case "task-group.declared":
      frame = { ...base, groupId: event.groupId, label: event.label };
      break;
    case "task.declared":
      frame = {
        ...base,
        taskId: event.taskId,
        label: event.label,
        placement:
          event.placement.kind === "root"
            ? { kind: "root" }
            : { kind: "group", groupId: event.placement.groupId },
      };
      break;
    case "task.started":
      frame = { ...base, taskId: event.taskId };
      break;
    case "task.progressed":
      frame = { ...base, taskId: event.taskId, progress: event.progress };
      break;
    case "task.finished":
      frame = { ...base, taskId: event.taskId, result: result(event.result) };
      break;
    case "content.published":
      frame = { ...base, item: item(event.item) };
      break;
    case "run.finished":
      frame = { ...base, result: result(event.result) };
      break;
  }
  return JSON.stringify(frame);
}
