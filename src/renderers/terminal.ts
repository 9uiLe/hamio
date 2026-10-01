import type {
  Cell,
  ContentItem,
  DataPresence,
  Failure,
  PresentationState,
  ProgressState,
  Result,
  SourceExtent,
  Task,
  TreeNode,
} from "../presentation/model.ts";
import { safeText } from "../terminal/text.ts";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";
interface Line {
  text: string;
  tone: Tone;
}
export interface TerminalRenderOptions {
  columns: number;
  color: boolean;
  animation: boolean;
  spinnerFrame?: number;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const spinner = ["|", "/", "-", "\\"] as const;
const ansi: Record<Exclude<Tone, "neutral">, number> = {
  info: 36,
  success: 32,
  warning: 33,
  danger: 31,
};

function width(value: string): number {
  return Bun.stringWidth(value);
}

function pad(value: string, length: number, right = false): string {
  const spaces = " ".repeat(Math.max(0, length - width(value)));
  return right ? `${spaces}${value}` : `${value}${spaces}`;
}

function wrap(value: string, prefix: string, columns: number): string[] {
  const output: string[] = [];
  const indent = prefix.slice(0, Math.max(0, columns - 1));
  // Font fallback can render an emoji wider than Bun.stringWidth reports.
  // A small right margin also prevents auto-wrap from adding an unowned row.
  const available = Math.max(1, columns - width(indent) - 4);
  for (const raw of value.split("\n")) {
    const safe = safeText(raw);
    let current = "";
    let used = 0;
    for (const token of safe.match(/\s+|\S+/gu) ?? []) {
      if (used > 0 && used + width(token) > available) {
        output.push(`${indent}${current}`);
        current = "";
        used = 0;
      }
      for (const { segment } of segmenter.segment(token)) {
        const next = width(segment);
        if (used > 0 && used + next > available) {
          output.push(`${indent}${current}`);
          current = "";
          used = 0;
        }
        current += segment;
        used += next;
      }
    }
    output.push(`${indent}${current}`);
  }
  return output;
}

function cell(value: Cell): string {
  if (value.kind === "redacted") return "[redacted]";
  return typeof value.value === "string" ? JSON.stringify(value.value) : String(value.value);
}

function sourceExtent(value: SourceExtent): string | undefined {
  if (value.kind === "complete") return undefined;
  return value.omittedCount === undefined
    ? "source truncated"
    : `source truncated; ${value.omittedCount} omitted`;
}

function progress(value: ProgressState, columns: number): string {
  if (value.kind === "none") return "";
  if (value.kind === "indeterminate") return "total unknown";
  const count = `${value.current}/${value.total}`;
  if (columns < 64) return count;
  const filled = Math.round((value.current / value.total) * 8);
  return `${count} [${"#".repeat(filled)}${"-".repeat(8 - filled)}]`;
}

function presence(value: DataPresence): string {
  return value.kind === "none" ? "no data" : `data: ${JSON.stringify(value.value)}`;
}

function status(kind: Result["kind"] | "pending" | "running"): string {
  switch (kind) {
    case "pending":
      return ". pending";
    case "running":
      return "> running";
    case "succeeded":
      return "+ succeeded";
    case "failed":
      return "! failed";
    case "cancelled":
      return "- cancelled";
  }
}

function toneFor(kind: Result["kind"] | "pending" | "running"): Tone {
  if (kind === "running") return "info";
  if (kind === "succeeded") return "success";
  if (kind === "failed") return "danger";
  return "neutral";
}

export function terminalLines(
  state: PresentationState,
  options: TerminalRenderOptions,
): readonly Line[] {
  if (!Number.isSafeInteger(options.columns) || options.columns < 20 || options.columns > 500)
    throw new Error("Terminal columns must be an integer from 20 to 500.");
  const output: Line[] = [];
  const add = (value: string, indent = 0, tone: Tone = "neutral") => {
    const prefix = " ".repeat(Math.min(indent, Math.max(0, options.columns - 2)));
    for (const line of wrap(value, prefix, options.columns)) output.push({ text: line, tone });
  };
  const running = state.run.kind === "present" && state.run.value.state.kind === "running";
  let animated = false;
  const cue = (kind: Result["kind"] | "pending" | "running") => {
    if (kind !== "running" || !running || !options.animation || animated) return status(kind);
    animated = true;
    return `${spinner[(options.spinnerFrame ?? 0) % spinner.length]} running`;
  };
  const detail = (result: Result, indent: number) => {
    if (result.kind === "failed") failure(result.failure, indent);
    else if (result.kind === "cancelled" && result.reason !== undefined)
      add(`reason: ${result.reason}`, indent);
    else if (result.kind === "succeeded") {
      if (result.message !== undefined) add(result.message, indent);
      add(presence(result.data), indent);
    }
  };
  const failure = (value: Failure, indent: number) => {
    add(`code: ${value.code}`, indent, "danger");
    add(value.message, indent, "danger");
    if (value.details.kind === "value")
      add(`details: ${JSON.stringify(value.details.value)}`, indent);
  };
  const task = (value: Task, indent: number) => {
    const kind = value.state.kind;
    const suffix = kind === "running" ? progress(value.state.progress, options.columns) : "";
    add(`${cue(kind)}  ${value.label}${suffix ? `  ${suffix}` : ""}`, indent, toneFor(kind));
    if (kind === "succeeded" || kind === "failed" || kind === "cancelled")
      detail(value.state, indent + 2);
  };
  if (state.run.kind === "present") {
    const run = state.run.value;
    add(`${cue(run.state.kind)}  Run: ${run.title}`, 0, toneFor(run.state.kind));
  }
  for (const item of state.items) {
    if (item.kind === "task") task(item, 2);
    else if (item.kind === "task-group") {
      add(`Group: ${item.label}`, 2);
      for (const child of item.tasks) task(child, 4);
    } else content(item);
  }
  if (state.run.kind === "present" && state.run.value.state.kind !== "running") {
    const result = state.run.value.state;
    // The final Run result remains discoverable after a long sequence of content and Tasks.
    add(`${status(result.kind)}  Run result`, 0, toneFor(result.kind));
    detail(result, 2);
  }
  return output;

  function content(item: ContentItem): void {
    switch (item.kind) {
      case "message": {
        const cue = item.level === "info" ? "i" : item.level === "success" ? "+" : "!";
        const tone: Tone = item.level === "error" ? "danger" : item.level;
        add(`${cue} ${item.level}  ${item.text}`, 0, tone);
        break;
      }
      case "progress":
        add(
          `Progress: ${item.label}  ${progress(item.progress, options.columns) || "no progress information"}`,
        );
        break;
      case "result":
        add(`${status(item.result.kind)}  Result`, 0, toneFor(item.result.kind));
        detail(item.result, 2);
        break;
      case "failure":
        add("! failure", 0, "danger");
        failure(item.failure, 2);
        break;
      case "table": {
        add(`Table: ${item.rows.length} ${item.rows.length === 1 ? "row" : "rows"}`);
        const headers = item.columns.map((column) => safeText(column.label));
        const rows = item.rows.map((row) => row.map(cell).map(safeText));
        const widths = headers.map((header, index) =>
          Math.max(width(header), ...rows.map((row) => width(row[index] ?? ""))),
        );
        const tableWidth = widths.reduce((sum, item) => sum + item, 0) + (widths.length - 1) * 2;
        if (tableWidth <= options.columns - 5) {
          const numeric = item.columns.map(
            (_, index) =>
              item.rows.length > 0 &&
              item.rows.every(
                (row) => row[index]?.kind === "visible" && typeof row[index].value === "number",
              ),
          );
          const rowText = (values: readonly string[]) =>
            values.map((value, index) => pad(value, widths[index] ?? 0, numeric[index])).join("  ");
          add(rowText(headers), 2);
          for (const row of rows) add(rowText(row), 2);
        } else {
          for (const [index, row] of rows.entries()) {
            add(`row ${index + 1}`, 2);
            for (const [column, value] of row.entries()) add(`${headers[column]}: ${value}`, 4);
          }
        }
        if (item.rows.length === 0) add("no rows", 2);
        const note = sourceExtent(item.extent);
        if (note) add(note, 2);
        break;
      }
      case "key-value":
        add("KeyValue");
        if (item.entries.length === 0) add("no entries", 2);
        for (const entry of item.entries) add(`${entry.label}: ${cell(entry.value)}`, 2);
        break;
      case "code": {
        add(`Code${item.language === undefined ? "" : ` (${item.language})`}`);
        add(item.text === "" ? "(empty)" : item.text, 2);
        const note = sourceExtent(item.extent);
        if (note) add(note, 2);
        break;
      }
      case "diff": {
        add(`Diff${item.source === undefined ? "" : ` (${item.source})`}`);
        for (const line of item.lines) {
          const marker = line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " ";
          add(
            `${marker} ${line.text}`,
            2,
            line.kind === "added" ? "success" : line.kind === "removed" ? "danger" : "neutral",
          );
        }
        if (item.lines.length === 0) add("(empty)", 2);
        const note = sourceExtent(item.extent);
        if (note) add(note, 2);
        break;
      }
      case "tree": {
        add("Tree");
        if (item.nodes.length === 0) add("(empty)", 2);
        for (const node of item.nodes) tree(node, [], 0);
        const note = sourceExtent(item.extent);
        if (note) add(note, 2);
        break;
      }
      case "summary":
        add(`Summary: ${item.headline}`);
        for (const point of item.points) add(`- ${point}`, 2);
        break;
      case "redacted":
        add("[redacted]");
        break;
    }
  }
  function tree(node: TreeNode, ancestors: readonly string[], depth: number): void {
    const indent = 2 + Math.min(depth, options.columns < 60 ? 2 : 4) * 2;
    const name =
      depth > (options.columns < 60 ? 2 : 4)
        ? `${ancestors.map(safeText).join(" / ")} / ${node.label}`
        : node.label;
    add(name, indent);
    for (const child of node.children) tree(child, [...ancestors, node.label], depth + 1);
  }
}

export function terminalFrame(
  state: PresentationState,
  options: TerminalRenderOptions,
): {
  plain: string[];
  styled: string[];
} {
  const lines = terminalLines(state, options);
  return {
    plain: lines.map((line) => line.text),
    styled: lines.map(({ text, tone }) =>
      options.color && tone !== "neutral" ? `\u001b[${ansi[tone]}m${text}\u001b[0m` : text,
    ),
  };
}

export function renderTerminal(state: PresentationState, options: TerminalRenderOptions): string {
  return `${terminalFrame(state, options).styled.join("\n")}\n`;
}
