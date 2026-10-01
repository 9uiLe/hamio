import type {
  Cell,
  ContentItem,
  PresentationState,
  ProgressState,
  Result,
  SourceExtent,
  Task,
  TreeNode,
} from "../presentation/model.ts";
import { safeText } from "../terminal/text.ts";

const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function lines(text: string, indent: string, columns: number): string[] {
  const width = Math.max(1, columns - Bun.stringWidth(indent));
  const result: string[] = [];
  for (const raw of text.split("\n")) {
    let current = "";
    let used = 0;
    for (const token of safeText(raw).match(/\s+|\S+/gu) ?? []) {
      const tokenWidth = Bun.stringWidth(token);
      if (used > 0 && used + tokenWidth > width) {
        result.push(`${indent}${current.trimEnd()}`);
        current = "";
        used = 0;
      }
      if (!current && /^\s+$/u.test(token)) continue;
      for (const { segment } of segments.segment(token)) {
        const length = Bun.stringWidth(segment);
        if (used + length > width && current) {
          result.push(`${indent}${current}`);
          current = "";
          used = 0;
        }
        current += segment;
        used += length;
      }
    }
    result.push(`${indent}${current}`);
  }
  return result;
}

function progress(value: ProgressState): string {
  if (value.kind === "determinate") return `determinate ${value.current}/${value.total}`;
  return value.kind;
}

function result(value: Result): string {
  if (value.kind === "failed")
    return `failed: ${value.failure.code}: ${value.failure.message}${value.failure.details.kind === "value" ? `; details ${JSON.stringify(value.failure.details.value)}` : ""}`;
  if (value.kind === "cancelled") return `cancelled${value.reason ? `: ${value.reason}` : ""}`;
  return `succeeded${value.message ? `: ${value.message}` : ""}${value.data.kind === "value" ? `; data ${JSON.stringify(value.data.value)}` : "; no data"}`;
}

function cell(value: Cell): string {
  return value.kind === "redacted" ? "[redacted]" : String(value.value);
}

function extent(value: SourceExtent): string {
  return value.kind === "truncated"
    ? ` [source truncated${value.omittedCount === undefined ? "" : `; ${value.omittedCount} omitted`}]`
    : "";
}

function task(value: Task): string {
  return `Task ${value.label} (${value.id}) — ${value.state.kind === "running" ? `running; progress ${progress(value.state.progress)}` : value.state.kind === "pending" ? "pending" : result(value.state)}`;
}

export function renderTerminalDiagnostic(state: PresentationState, columns = 80): string {
  if (!Number.isSafeInteger(columns) || columns < 24 || columns > 240)
    throw new Error("Terminal columns must be an integer from 24 to 240.");
  const output: string[] = [];
  const add = (text: string, depth = 0) =>
    output.push(
      ...lines(text, "  ".repeat(Math.min(depth, Math.floor((columns - 4) / 2))), columns),
    );
  if (state.run.kind === "present") {
    const run = state.run.value;
    add(
      `Run ${run.title} (${run.id}) — ${run.state.kind === "running" ? "running" : result(run.state)}`,
    );
  } else add("Presentation without Run");
  for (const item of state.items) {
    if (item.kind === "task") {
      add(task(item), 1);
    } else if (item.kind === "task-group") {
      add(`TaskGroup ${item.label} (${item.id})`, 1);
      for (const child of item.tasks) add(task(child), 2);
    } else renderContent(item, add);
  }
  return `${output.join("\n")}\n`;
}

function renderContent(item: ContentItem, add: (text: string, depth?: number) => void): void {
  switch (item.kind) {
    case "message":
      add(`Message [${item.level}] ${item.text}`, 1);
      break;
    case "progress":
      add(`Progress ${item.label}: ${progress(item.progress)}`, 1);
      break;
    case "result":
      add(`Result ${result(item.result)}`, 1);
      break;
    case "failure":
      add(`Failure ${item.failure.code}: ${item.failure.message}`, 1);
      if (item.failure.details.kind === "value")
        add(`Details ${JSON.stringify(item.failure.details.value)}`, 2);
      break;
    case "table":
      add(`Table (${item.rows.length} rows)${extent(item.extent)}`, 1);
      add(`Columns: ${item.columns.map((column) => column.label).join(" | ")}`, 2);
      for (const row of item.rows)
        add(
          row.map((value, index) => `${item.columns[index]?.label}: ${cell(value)}`).join(" | "),
          2,
        );
      break;
    case "key-value":
      add(`KeyValue (${item.entries.length} entries)`, 1);
      for (const entry of item.entries) add(`${entry.label}: ${cell(entry.value)}`, 2);
      break;
    case "code":
      add(`Code${item.language ? ` (${item.language})` : ""}${extent(item.extent)}`, 1);
      for (const line of item.text.split("\n")) add(line, 2);
      break;
    case "diff":
      add(`Diff${item.source ? ` (${item.source})` : ""}${extent(item.extent)}`, 1);
      for (const line of item.lines) add(`${line.kind}: ${line.text}`, 2);
      break;
    case "tree":
      add(`Tree${extent(item.extent)}`, 1);
      for (const node of item.nodes) renderTree(node, 2, add);
      break;
    case "summary":
      add(`Summary: ${item.headline}`, 1);
      for (const point of item.points) add(`- ${point}`, 2);
      break;
    case "redacted":
      add("[redacted item]", 1);
      break;
  }
}

function renderTree(
  node: TreeNode,
  depth: number,
  add: (text: string, depth?: number) => void,
): void {
  add(node.label, depth);
  for (const child of node.children) renderTree(child, depth + 1, add);
}
