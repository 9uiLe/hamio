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

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function text(value: string | number | boolean | null): string {
  return escapeHtml(String(value));
}

function data(value: { kind: "none" } | { kind: "value"; value: unknown }): string {
  return value.kind === "none" ? "no data" : `data: ${escapeHtml(JSON.stringify(value.value))}`;
}

function result(value: Result): string {
  if (value.kind === "failed")
    return `failed: ${text(value.failure.code)}: ${text(value.failure.message)}${value.failure.details.kind === "value" ? `; ${data(value.failure.details)}` : ""}`;
  if (value.kind === "cancelled")
    return `cancelled${value.reason ? `: ${text(value.reason)}` : ""}`;
  return `succeeded${value.message ? `: ${text(value.message)}` : ""}; ${data(value.data)}`;
}

function progress(value: ProgressState): string {
  return value.kind === "determinate" ? `determinate ${value.current}/${value.total}` : value.kind;
}

function extent(value: SourceExtent): string {
  return value.kind === "truncated"
    ? `<p>Source truncated${value.omittedCount === undefined ? "" : `; ${value.omittedCount} omitted`}</p>`
    : "";
}

function cell(value: Cell): string {
  return value.kind === "redacted" ? "[redacted]" : text(value.value);
}

function task(value: Task, heading: "h2" | "h3"): string {
  const state =
    value.state.kind === "running"
      ? `running; progress ${progress(value.state.progress)}`
      : value.state.kind === "pending"
        ? "pending"
        : result(value.state);
  return `<section><${heading}>Task ${text(value.label)}</${heading}><p>ID: ${text(value.id)}; status: ${state}</p></section>`;
}

function tree(value: TreeNode): string {
  return `<li>${text(value.label)}${value.children.length ? `<ul>${value.children.map(tree).join("")}</ul>` : ""}</li>`;
}

function content(item: ContentItem): string {
  switch (item.kind) {
    case "message":
      return `<section><h2>Message</h2><p>Level: ${text(item.level)}; ${text(item.text)}</p></section>`;
    case "progress":
      return `<section><h2>Progress</h2><p>${text(item.label)}: ${progress(item.progress)}</p></section>`;
    case "result":
      return `<section><h2>Result</h2><p>${result(item.result)}</p></section>`;
    case "failure":
      return `<section><h2>Failure</h2><p>${text(item.failure.code)}: ${text(item.failure.message)}</p>${item.failure.details.kind === "value" ? `<pre>${data(item.failure.details)}</pre>` : ""}</section>`;
    case "table":
      return `<section><h2>Table</h2>${extent(item.extent)}<p>Scroll horizontally to inspect all columns at narrow widths.</p><div class="table-scroll" role="region" aria-label="Table columns" tabindex="0"><table><caption>${item.rows.length} rows</caption><thead><tr>${item.columns.map((column) => `<th scope="col">${text(column.label)}</th>`).join("")}</tr></thead><tbody>${item.rows.map((row) => `<tr>${row.map((value) => `<td>${cell(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></section>`;
    case "key-value":
      return `<section><h2>KeyValue</h2><p>${item.entries.length} entries</p><dl>${item.entries.map((entry) => `<dt>${text(entry.label)}</dt><dd>${cell(entry.value)}</dd>`).join("")}</dl></section>`;
    case "code":
      return `<section><h2>Code${item.language ? ` (${text(item.language)})` : ""}</h2>${extent(item.extent)}<pre><code>${text(item.text)}</code></pre></section>`;
    case "diff":
      return `<section><h2>Diff${item.source ? ` (${text(item.source)})` : ""}</h2>${extent(item.extent)}<pre>${item.lines.map((line) => `${text(line.kind)}: ${text(line.text)}`).join("\n")}</pre></section>`;
    case "tree":
      return `<section><h2>Tree</h2>${extent(item.extent)}<ul>${item.nodes.map(tree).join("")}</ul></section>`;
    case "summary":
      return `<section><h2>Summary</h2><p>${text(item.headline)}</p><ul>${item.points.map((point) => `<li>${text(point)}</li>`).join("")}</ul></section>`;
    case "redacted":
      return "<section><h2>Redacted item</h2><p>[redacted]</p></section>";
  }
}

export function renderHtmlDiagnostic(state: PresentationState): string {
  const run =
    state.run.kind === "none"
      ? "<h1>Presentation without Run</h1>"
      : `<h1>Run ${text(state.run.value.title)}</h1><p>ID: ${text(state.run.value.id)}; status: ${state.run.value.state.kind === "running" ? "running" : result(state.run.value.state)}</p>`;
  const items = state.items
    .map((item) => {
      if (item.kind === "task") return task(item, "h2");
      if (item.kind === "task-group")
        return `<section><h2>TaskGroup ${text(item.label)}</h2><p>ID: ${text(item.id)}</p>${item.tasks.map((child) => task(child, "h3")).join("")}</section>`;
      return content(item);
    })
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Presentation diagnostic</title><style>body{font:1rem system-ui,sans-serif;margin:1rem;overflow-wrap:anywhere}section{margin-block:1rem}pre{white-space:pre-wrap;overflow-wrap:anywhere}table{border-collapse:collapse;min-width:34rem}th,td{border:1px solid;padding:.25rem;text-align:left;vertical-align:top}.table-scroll{overflow-x:auto}dt{font-weight:bold}dd{margin-inline-start:1rem}</style></head><body><main>${run}${items}</main></body></html>`;
}
