import { expect, test } from "bun:test";
import type { PresentationState } from "../src/presentation/model.ts";
import { renderHtmlDiagnostic } from "../src/renderers/html-diagnostic.ts";
import { renderTerminalDiagnostic } from "../src/renderers/terminal-diagnostic.ts";
import { catalogResponse } from "../scripts/catalog/server.ts";
import { resolveScenario, scenarioById } from "../scripts/catalog/scenarios.ts";

test("one Event scenario resolves through the Domain reducer for both diagnostic renderers", () => {
  const scenario = scenarioById("run-group-mixed");
  expect(scenario.source.kind).toBe("events");
  const state = resolveScenario(scenario);
  const original = structuredClone(state);
  const terminal = renderTerminalDiagnostic(state);
  const html = renderHtmlDiagnostic(state);
  expect(terminal).toContain("failed: BUILD_FAILED");
  expect(terminal).toContain("Run Deployment (r) — succeeded");
  expect(html).toContain("<h2>TaskGroup Checks</h2>");
  expect(html).toContain("<h3>Task Unit tests</h3>");
  expect(html).toContain("status: succeeded");
  expect(state).toEqual(original);
});

test("Terminal diagnostic text wraps without losing source content or emitting controls", () => {
  const state: PresentationState = {
    run: { kind: "none" },
    items: [
      {
        kind: "message",
        level: "warning",
        text: "Long warning with unsafe \u001b[31mtext\u001b[0m and a long value",
      },
    ],
  };
  const narrow = renderTerminalDiagnostic(state, 40);
  expect(narrow).toContain("warning");
  expect(narrow).toContain("long value");
  expect(narrow).not.toContain("\u001b");
  for (const line of narrow.trimEnd().split("\n"))
    expect(Bun.stringWidth(line)).toBeLessThanOrEqual(40);
});

test("HTML diagnostic output escapes input and keeps native table semantics", () => {
  const state: PresentationState = {
    run: { kind: "none" },
    items: [
      { kind: "message", level: "error", text: "<script>alert('x')</script>" },
      {
        kind: "table",
        columns: [{ key: "name", label: "Name" }],
        rows: [[{ kind: "redacted" }]],
        extent: { kind: "truncated", omittedCount: 1 },
      },
    ],
  };
  const original = structuredClone(state);
  const html = renderHtmlDiagnostic(state);
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).toContain('<th scope="col">Name</th>');
  expect(html).toContain('aria-label="Table columns" tabindex="0"');
  expect(html).toContain("Scroll horizontally to inspect all columns");
  expect(html).toContain("<td>[redacted]</td>");
  expect(html).toContain("Source truncated; 1 omitted");
  expect(html).toContain("Level: error");
  expect(state).toEqual(original);
});

test("Catalog routes expose the same scenario and report unknown IDs", async () => {
  const page = await catalogResponse(
    new Request("http://localhost/?scenario=task-running-partial&terminal=narrow&html=narrow"),
  ).text();
  const html = await catalogResponse(
    new Request("http://localhost/html?scenario=task-running-partial"),
  ).text();
  expect(page).toContain("40 columns");
  expect(page).toContain("360 px viewport");
  expect(page).toContain("actual Terminal renderer text");
  expect(page).toContain("determinate 2/4");
  expect(html).toContain("determinate 2/4");
  const missing = catalogResponse(new Request("http://localhost/html?scenario=does-not-exist"));
  expect(missing.status).toBe(500);
  expect(await missing.text()).toContain("does-not-exist");
});
