import { renderHtmlDiagnostic } from "../../src/renderers/html-diagnostic.ts";
import { renderTerminal } from "../../src/renderers/terminal.ts";
import { resolveScenario, scenarioById, scenarios } from "./scenarios.ts";

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ??
      character,
  );
}

function selection(value: string, selected: string): string {
  return value === selected ? " selected" : "";
}

export function catalogPage(url: URL): string {
  const id = url.searchParams.get("scenario") ?? scenarios[0]?.id;
  if (!id) throw new Error("Catalog has no scenarios.");
  const scenario = scenarioById(id);
  const terminalCondition = url.searchParams.get("terminal") === "narrow" ? "narrow" : "standard";
  const htmlCondition = url.searchParams.get("html") === "narrow" ? "narrow" : "default";
  const columns = terminalCondition === "narrow" ? 40 : 80;
  const htmlWidth = htmlCondition === "narrow" ? 360 : 640;
  const state = resolveScenario(scenario);
  let terminal: string;
  try {
    terminal = renderTerminal(state, { columns, color: false, animation: false });
  } catch (error) {
    throw new Error(
      `Scenario ${id}, Terminal renderer: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  const groups = [...new Set(scenarios.map((entry) => entry.category))];
  const options = groups
    .map(
      (group) =>
        `<optgroup label="${escapeHtml(group)}">${scenarios
          .filter((entry) => entry.category === group)
          .map(
            (entry) =>
              `<option value="${escapeHtml(entry.id)}"${selection(entry.id, id)}>${escapeHtml(entry.name)}</option>`,
          )
          .join("")}</optgroup>`,
    )
    .join("");
  const htmlUrl = `/html?scenario=${encodeURIComponent(id)}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>hamio semantic catalog</title><style>body{font:1rem system-ui,sans-serif;margin:1rem}form{display:flex;flex-wrap:wrap;gap:1rem;align-items:end}label{display:grid;gap:.25rem}main{max-width:100%}.panes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}.pane{min-width:0;overflow:auto;border:1px solid;padding:.5rem}.pane pre{white-space:pre;overflow:auto}.pane iframe{display:block;border:0;max-width:none;height:32rem}select,button{font:inherit}@media(max-width:800px){.panes{grid-template-columns:1fr}}</style></head><body><main><h1>hamio semantic catalog</h1><p>Terminal production renderer and HTML diagnostic renderer receive the same Presentation State. HTML visual design remains pending Phase 8.</p><form method="get"><label>Scenario<select name="scenario">${options}</select></label><label>Terminal condition<select name="terminal"><option value="standard"${selection("standard", terminalCondition)}>80 columns</option><option value="narrow"${selection("narrow", terminalCondition)}>40 columns</option></select></label><label>HTML condition<select name="html"><option value="default"${selection("default", htmlCondition)}>640 px</option><option value="narrow"${selection("narrow", htmlCondition)}>360 px</option></select></label><button type="submit">Inspect</button></form><section><h2>${escapeHtml(scenario.name)}</h2><p>${escapeHtml(scenario.description)}</p><p><strong>Category:</strong> ${escapeHtml(scenario.category)}. <strong>Source:</strong> ${scenario.source.kind === "events" ? "accepted Events" : "static State"}. <strong>Inspect:</strong> ${escapeHtml(scenario.intent)}.</p></section><div class="panes"><section class="pane"><h2>Terminal output</h2><p>${columns} columns; production Terminal renderer, plain output</p><pre>${escapeHtml(terminal)}</pre></section><section class="pane"><h2>HTML diagnostic output</h2><p>${htmlWidth} px viewport</p><iframe title="HTML diagnostic output for ${escapeHtml(scenario.name)}" src="${htmlUrl}" style="width:${htmlWidth}px"></iframe></section></div><details><summary>Resolved semantic State</summary><pre>${escapeHtml(JSON.stringify(state, null, 2))}</pre></details></main></body></html>`;
}

export function catalogResponse(request: Request): Response {
  const url = new URL(request.url);
  try {
    if (url.pathname === "/")
      return new Response(catalogPage(url), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    if (url.pathname === "/html") {
      const id = url.searchParams.get("scenario");
      if (!id) return new Response("Scenario ID is required.", { status: 400 });
      const state = resolveScenario(scenarioById(id));
      try {
        return new Response(renderHtmlDiagnostic(state), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      } catch (error) {
        throw new Error(
          `Scenario ${id}, HTML renderer: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    }
    return new Response("Not found", { status: 404 });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : String(error), {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

if (import.meta.main) {
  const raw = process.env.HAMIO_CATALOG_PORT ?? "4174";
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw new Error("HAMIO_CATALOG_PORT must be an integer from 1 to 65535.");
  try {
    const server = Bun.serve({ hostname: "127.0.0.1", port, fetch: catalogResponse });
    console.log(`Catalog: http://127.0.0.1:${server.port}/`);
  } catch (error) {
    throw new Error(`Cannot start Catalog on port ${port}. Choose another HAMIO_CATALOG_PORT.`, {
      cause: error,
    });
  }
}
