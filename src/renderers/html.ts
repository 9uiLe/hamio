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
import { htmlStyle } from "./html-style.ts";

export interface HtmlRenderOptions {
  mode?: "report" | "live";
  language?: string;
  theme?: "system" | "light" | "dark";
  motion?: "system" | "reduced";
}

export interface RecordingReportInfo {
  status: "complete" | "partial" | "invalid";
  eventCount: number;
  lastSeq: number | null;
  issue?: { line: number; code: string };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      default:
        return character === '"' ? "&quot;" : "&#39;";
    }
  });
}

const text = (value: string | number | boolean | null): string => escapeHtml(String(value));

function status(
  kind: string,
  tone: "neutral" | "info" | "success" | "warning" | "danger",
  live: boolean,
): string {
  const cue =
    kind === "pending"
      ? "."
      : kind === "running"
        ? ">"
        : kind === "succeeded"
          ? "+"
          : kind === "cancelled"
            ? "-"
            : "!";
  return `<span class="status" data-tone="${tone}"><span class="cue" aria-hidden="true">${cue}</span><span>${text(kind)}</span>${live && kind === "running" ? '<span class="activity" aria-hidden="true"></span>' : ""}</span>`;
}

function resultTone(kind: Result["kind"]): "neutral" | "success" | "danger" {
  return kind === "succeeded" ? "success" : kind === "failed" ? "danger" : "neutral";
}

function data(value: DataPresence, label: string): string {
  if (value.kind === "none") return `<p class="meta">${label}: no data</p>`;
  return `<div class="result-data"><p class="meta">${label}: value</p><div class="scroll" tabindex="0" role="region" aria-label="${label}; scroll horizontally to inspect"><pre><code>${text(JSON.stringify(value.value, null, 2))}</code></pre></div></div>`;
}

function failure(value: Failure, mode: "report" | "live"): string {
  const details =
    value.details.kind === "value"
      ? mode === "report"
        ? data(value.details, "Details")
        : `<details open><summary>Failure details</summary>${data(value.details, "Details")}</details>`
      : "";
  return `<div class="failure"><p class="failure-code">${text(value.code)}</p><p class="failure-message">${text(value.message)}</p>${details}</div>`;
}

function result(value: Result, showStatus: boolean, mode: "report" | "live"): string {
  const head = showStatus ? status(value.kind, resultTone(value.kind), false) : "";
  if (value.kind === "failed") return `${head}${failure(value.failure, mode)}`;
  if (value.kind === "cancelled")
    return `${head}${value.reason === undefined ? "" : `<p>${text(value.reason)}</p>`}`;
  return `${head}${value.message === undefined ? "" : `<p>${text(value.message)}</p>`}${data(value.data, "Result data")}`;
}

function progress(value: ProgressState, label: string, live: boolean, standalone: boolean): string {
  if (value.kind === "none")
    return standalone ? '<p class="progress-note">Progress information unavailable</p>' : "";
  if (value.kind === "indeterminate")
    return `<div class="progress-line"><span class="progress-note">Total unknown</span>${live ? `<progress class="progress-ongoing" aria-label="${escapeHtml(label)}; total unknown"></progress>` : ""}<span class="progress-static${live ? " motion-fallback" : ""}" role="progressbar" aria-label="${escapeHtml(label)}" aria-valuetext="Total unknown"></span></div>`;
  return `<div class="progress-line"><span class="number">${text(value.current)} / ${text(value.total)}</span><progress value="${value.current}" max="${value.total}" aria-label="${escapeHtml(label)}: ${value.current} of ${value.total}"></progress></div>`;
}

function extent(value: SourceExtent): string {
  if (value.kind === "complete") return "";
  return `<p class="source-truncated">Source truncated${value.omittedCount === undefined ? "" : `; ${text(value.omittedCount)} omitted`}</p>`;
}

function cell(value: Cell): string {
  return value.kind === "redacted"
    ? '<span class="redacted">[redacted]</span>'
    : value.value === null
      ? '<span class="mono">null</span>'
      : value.value === ""
        ? '<span class="meta">empty string</span>'
        : text(value.value);
}

function task(value: Task, heading: "h2" | "h3", mode: "report" | "live"): string {
  const kind = value.state.kind;
  const tone =
    kind === "running"
      ? "info"
      : kind === "succeeded"
        ? "success"
        : kind === "failed"
          ? "danger"
          : "neutral";
  const detail =
    kind === "running"
      ? `<div class="task-progress">${progress(value.state.progress, value.label, false, false)}</div>`
      : kind === "pending"
        ? ""
        : `<div class="task-failure">${result(value.state, false, mode)}</div>`;
  return `<li class="task" data-state="${kind}"><div class="task-main">${status(kind, tone, false)}<${heading}>${text(value.label)}</${heading}><span class="meta mono">${text(value.id)}</span></div>${detail}</li>`;
}

function treeNode(value: TreeNode): string {
  return `<li>${text(value.label)}${value.children.length ? `<ul class="tree-list">${value.children.map(treeNode).join("")}</ul>` : ""}</li>`;
}

function content(item: ContentItem, mode: "report" | "live", runActivity: boolean): string {
  switch (item.kind) {
    case "message": {
      const tone =
        item.level === "error"
          ? "danger"
          : item.level === "warning"
            ? "warning"
            : item.level === "success"
              ? "success"
              : "info";
      return `<section class="item message" data-tone="${tone}" aria-label="Message"><span class="level">${text(item.level)}</span><p>${text(item.text)}</p></section>`;
    }
    case "progress":
      return `<section class="item"><h2>${text(item.label)}</h2>${progress(item.progress, item.label, mode === "live" && !runActivity, true)}</section>`;
    case "result":
      return `<section class="item result"><h2>Result</h2>${result(item.result, true, mode)}</section>`;
    case "failure":
      return `<section class="item"><h2>Failure</h2>${failure(item.failure, mode)}</section>`;
    case "table": {
      const numeric = item.columns.map(
        (_, index) =>
          item.rows.length > 0 &&
          item.rows.every((row) => {
            const value = row[index];
            return value?.kind === "visible" && typeof value.value === "number";
          }),
      );
      return `<section class="item"><h2>Table</h2><p class="scroll-hint">Scroll horizontally to inspect all columns.</p><div class="scroll" role="region" tabindex="0" aria-label="Table columns; scroll horizontally to inspect all columns"><table><caption>${item.rows.length} ${item.rows.length === 1 ? "row" : "rows"}</caption><thead><tr>${item.columns.map((column) => `<th scope="col">${text(column.label)}</th>`).join("")}</tr></thead><tbody>${item.rows.length ? item.rows.map((row) => `<tr>${row.map((value, index) => `<td${numeric[index] ? ' class="number"' : ""}>${cell(value)}</td>`).join("")}</tr>`).join("") : `<tr><td class="empty" colspan="${item.columns.length}">No rows</td></tr>`}</tbody></table></div>${extent(item.extent)}</section>`;
    }
    case "key-value":
      return `<section class="item"><h2>KeyValue</h2>${item.entries.length ? `<dl class="key-values">${item.entries.map((entry) => `<dt>${text(entry.label)}</dt><dd>${cell(entry.value)}</dd>`).join("")}</dl>` : '<p class="empty">No entries</p>'}</section>`;
    case "code":
      return `<section class="item"><h2>Code${item.language === undefined ? "" : ` <span class="meta">${text(item.language)}</span>`}</h2>${item.text === "" ? '<p class="empty">Empty code</p>' : '<p class="scroll-hint">Scroll horizontally to read long lines.</p>'}<div class="scroll code-surface" role="region" tabindex="0" aria-label="Code; scroll horizontally to inspect"><pre><code>${text(item.text)}</code></pre></div>${extent(item.extent)}</section>`;
    case "diff":
      return `<section class="item"><h2>Diff${item.source === undefined ? "" : ` <span class="meta">${text(item.source)}</span>`}</h2>${item.lines.length ? `<p class="scroll-hint">Scroll horizontally to read long lines.</p><div class="scroll diff-surface" role="region" tabindex="0" aria-label="Diff; scroll horizontally to inspect"><ol class="diff-lines">${item.lines.map((line) => `<li class="${line.kind}"><span class="kind">${line.kind === "added" ? "+ Added" : line.kind === "removed" ? "- Removed" : "  Context"}</span><span>${text(line.text)}</span></li>`).join("")}</ol></div>` : '<p class="empty">No diff lines</p>'}${extent(item.extent)}</section>`;
    case "tree":
      return `<section class="item"><h2>Tree</h2>${item.nodes.length ? `<ul class="tree-list">${item.nodes.map(treeNode).join("")}</ul>` : '<p class="empty">No nodes</p>'}${extent(item.extent)}</section>`;
    case "summary":
      return `<section class="item summary"><h2>Summary</h2><p>${text(item.headline)}</p>${item.points.length ? `<ul>${item.points.map((point) => `<li>${text(point)}</li>`).join("")}</ul>` : ""}</section>`;
    case "redacted":
      return '<section class="item"><h2>Redacted</h2><p class="redacted">[redacted]</p></section>';
  }
}

export function renderHtml(state: PresentationState, options: HtmlRenderOptions = {}): string {
  return renderDocument(state, options);
}

export function renderRecordingReport(
  state: PresentationState,
  recording: RecordingReportInfo,
): string {
  return renderDocument(state, { mode: "report" }, recording);
}

function renderDocument(
  state: PresentationState,
  options: HtmlRenderOptions,
  recording?: RecordingReportInfo,
): string {
  const mode = options.mode ?? "report";
  const theme = options.theme ?? "system";
  const motion = options.motion ?? "system";
  const language = options.language ?? "en";
  if (mode !== "report" && mode !== "live") throw new Error("Invalid HTML mode.");
  if (theme !== "system" && theme !== "light" && theme !== "dark")
    throw new Error("Invalid HTML theme.");
  if (motion !== "system" && motion !== "reduced") throw new Error("Invalid HTML motion policy.");
  if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(language))
    throw new Error("HTML document language must be a language tag.");
  const run = state.run.kind === "present" ? state.run.value : undefined;
  const title = run?.title ?? "Presentation";
  const runHead = run
    ? `<header class="run-head"><h1>${text(run.title)}</h1>${status(run.state.kind, run.state.kind === "running" ? "info" : resultTone(run.state.kind), mode === "live")}<span class="meta mono">${text(run.id)}</span></header>`
    : '<header class="run-head"><h1>Presentation</h1></header>';
  const parts: string[] = [];
  let adjacentTasks: Task[] = [];
  const flushTasks = () => {
    if (adjacentTasks.length === 0) return;
    parts.push(
      `<section class="item"><ul class="tasks">${adjacentTasks.map((value) => task(value, "h2", mode)).join("")}</ul></section>`,
    );
    adjacentTasks = [];
  };
  for (const item of state.items) {
    if (item.kind === "task") {
      adjacentTasks.push(item);
      continue;
    }
    flushTasks();
    if (item.kind === "task-group")
      parts.push(
        `<section class="item group"><div class="group-head"><h2>${text(item.label)}</h2><span class="meta mono">${text(item.id)}</span></div><ul class="tasks">${item.tasks.map((child) => task(child, "h3", mode)).join("")}</ul></section>`,
      );
    else parts.push(content(item, mode, run?.state.kind === "running"));
  }
  flushTasks();
  const items = parts.join("");
  const runResult =
    run && run.state.kind !== "running"
      ? `<footer class="run-result"><h2>Run result</h2>${result(run.state, true, mode)}</footer>`
      : "";
  const lang = ` lang="${escapeHtml(language)}"`;
  const themeAttr = theme === "system" ? "" : ` data-theme="${theme}"`;
  const motionAttr = motion === "system" ? "" : ` data-motion="${motion}"`;
  const pause =
    mode === "live" &&
    (run?.state.kind === "running" ||
      state.items.some(
        (item) => item.kind === "progress" && item.progress.kind === "indeterminate",
      ))
      ? '<label class="motion-control"><input type="checkbox">Pause visual motion</label>'
      : "";
  const liveRegions =
    mode === "live"
      ? '<div class="sr-only" aria-live="polite" aria-atomic="true"></div><div class="sr-only" aria-live="assertive" aria-atomic="true"></div>'
      : "";
  const recordingPanel =
    recording === undefined
      ? ""
      : `<aside class="recording-meta" aria-label="Recording status"><p><strong>Recording ${recording.status === "partial" ? "incomplete" : text(recording.status)}</strong> · ${text(recording.eventCount)} accepted events · final sequence ${recording.lastSeq === null ? "none" : text(recording.lastSeq)}</p>${recording.issue === undefined ? "" : `<p>Issue at line ${text(recording.issue.line)}: ${text(recording.issue.code)}</p>`}</aside>`;
  return `<!doctype html><html${lang}${themeAttr}${motionAttr}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'"><title>${text(title)} · hamio</title><style>${htmlStyle}</style></head><body><div class="presentation">${pause}<main>${recordingPanel}${runHead}<div class="items">${items}</div>${runResult}</main>${liveRegions}</div></body></html>`;
}
