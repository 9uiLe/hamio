import { expect, test } from "bun:test";
import type { PresentationState } from "../src/presentation/model.ts";
import { PresentationSession } from "../src/presentation/session.ts";
import { htmlAnnouncement } from "../src/renderers/html-announcements.ts";
import { renderHtml } from "../src/renderers/html.ts";
import { resolveScenario, scenarioById } from "../scripts/catalog/scenarios.ts";

function scenario(id: string): string {
  return renderHtml(resolveScenario(scenarioById(id)), { language: "en" });
}

test("Task and Run remain distinct, including full progress while running", () => {
  const full = scenario("task-running-complete");
  expect(full).toContain("running</span>");
  expect(full).toContain('max="4"');
  expect(full).toContain("4 / 4");
  expect(full).not.toContain("Run result</h2>");
  const mixed = scenario("run-group-mixed");
  expect(mixed).toContain("<h2>Checks</h2>");
  expect(mixed).toContain("<h3>Unit tests</h3>");
  expect(mixed).toContain("BUILD_FAILED");
  expect(mixed).toContain('Run result</h2><span class="status" data-tone="success"');
});

test("adjacent Tasks share a dense list without nesting intervening content", () => {
  const task = (id: string) => ({
    kind: "task" as const,
    id,
    label: `Task ${id}`,
    state: { kind: "pending" as const },
  });
  const state: PresentationState = {
    run: { kind: "present", value: { id: "run", title: "Build", state: { kind: "running" } } },
    items: [
      task("a"),
      task("b"),
      { kind: "message", level: "warning", text: "Check output" },
      task("c"),
    ],
  };
  const html = renderHtml(state);
  expect(html.match(/<ul class="tasks">/g)).toHaveLength(2);
  expect(html.indexOf("Task a")).toBeLessThan(html.indexOf("Task b"));
  expect(html.indexOf("Task b")).toBeLessThan(html.indexOf("Check output"));
  expect(html.indexOf("Check output")).toBeLessThan(html.indexOf("Task c"));
});

test("Progress none, indeterminate, and zero have distinct representations", () => {
  const none = scenario("task-running-none");
  const unknown = scenario("task-running-indeterminate");
  const zero = scenario("task-running-zero");
  expect(none).toContain("running</span>");
  expect(none).not.toContain("<progress");
  expect(unknown).toContain("Total unknown");
  expect(unknown).toContain('role="progressbar"');
  expect(unknown).not.toContain("<progress");
  expect(zero).toContain("0 / 4");
  expect(zero).toContain('value="0" max="4"');
});

test("HTML uses native structure and preserves empty, null, redacted and source truncation", () => {
  const table = scenario("table-narrow-long-redacted");
  expect(table).toContain("<table>");
  expect(table).toContain("<caption>");
  expect(table).toContain('scope="col"');
  expect(table).toContain('tabindex="0"');
  expect(table).toContain("[redacted]");
  const truncated = scenario("table-large-truncated");
  expect(truncated).toContain("Source truncated");
  const content = scenario("tree-keyvalue-summary");
  expect(content).toContain('<dl class="key-values">');
  expect(content).toContain('<ul class="tree-list">');
  expect(content).toContain("<h2>Summary</h2>");
  const results = scenario("results-all-states");
  expect(results).toContain("Failure</h2>");
  expect(results).toContain("src/build.ts");
  expect(results).not.toContain("<details");
  const liveResults = renderHtml(resolveScenario(scenarioById("results-all-states")), {
    mode: "live",
  });
  expect(liveResults).toContain("<details open>");
  const codeDiff = scenario("code-diff");
  expect(codeDiff).toContain("<pre><code>");
  expect(codeDiff).toContain("+ Added");
  expect(codeDiff).toContain("- Removed");
});

test("untrusted text is escaped across content and attributes", () => {
  const malicious = `<script>alert("x")</script>&'\u202e`;
  const state: PresentationState = {
    run: { kind: "none" },
    items: [
      { kind: "message", level: "error", text: malicious },
      {
        kind: "progress",
        label: malicious,
        progress: { kind: "determinate", current: 1, total: 2 },
      },
      { kind: "code", text: malicious, language: malicious, extent: { kind: "complete" } },
      {
        kind: "diff",
        lines: [{ kind: "added", text: malicious }],
        source: malicious,
        extent: { kind: "complete" },
      },
      {
        kind: "table",
        columns: [{ key: "x", label: malicious }],
        rows: [[{ kind: "visible", value: malicious }]],
        extent: { kind: "complete" },
      },
      {
        kind: "failure",
        failure: {
          code: malicious,
          message: malicious,
          details: { kind: "value", value: { value: malicious } },
        },
      },
    ],
  };
  const before = structuredClone(state);
  const html = renderHtml(state, { language: "ja" });
  expect(html).toContain("&lt;script&gt;");
  expect(html).toContain("&quot;x&quot;");
  expect(html).toContain("&amp;&#39;");
  expect(html).toContain("unicode-bidi: isolate");
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("<script>alert");
  expect(html).toContain('lang="ja"');
  expect(state).toEqual(before);
  expect(() => renderHtml(state, { language: 'en" onclick="bad' })).toThrow();
  expect(() => renderHtml(state, { theme: 'dark" onmouseover="bad' as "dark" })).toThrow();
});

test("report is initially static; live and reduced motion have separate representation policy", () => {
  const state = resolveScenario(scenarioById("task-running-indeterminate"));
  const report = renderHtml(state);
  const live = renderHtml(state, { mode: "live" });
  const reduced = renderHtml(state, { mode: "live", motion: "reduced", theme: "dark" });
  expect(report).not.toContain('class="activity"');
  expect(live).toContain('class="activity"');
  expect(live).toContain('role="progressbar"');
  expect(live).toContain("Pause visual motion");
  expect(live).toContain('aria-live="polite"');
  expect(live).toContain('aria-live="assertive"');
  expect(reduced).toContain('data-motion="reduced"');
  expect(reduced).toContain('data-theme="dark"');
  expect(reduced).toContain("@media (prefers-reduced-motion: reduce)");
  expect(renderHtml(resolveScenario(scenarioById("run-failed")), { mode: "live" })).not.toContain(
    'class="activity"',
  );
  expect(report).not.toContain("<script");
  expect(report).not.toContain("https://");
});

test("live announcement policy follows accepted State changes and ignores progress churn", () => {
  const session = new PresentationSession();
  let before = session.snapshot();
  const updates = [
    { type: "run.started", runId: "r", seq: 0, title: "Build" },
    {
      type: "task.declared",
      runId: "r",
      seq: 1,
      taskId: "t",
      label: "Compile",
      placement: { kind: "root" },
    },
    { type: "task.started", runId: "r", seq: 2, taskId: "t" },
    {
      type: "task.progressed",
      runId: "r",
      seq: 3,
      taskId: "t",
      progress: { kind: "determinate", current: 1, total: 2 },
    },
    {
      type: "task.finished",
      runId: "r",
      seq: 4,
      taskId: "t",
      result: {
        kind: "failed",
        failure: { code: "BUILD", message: "Compilation failed", details: { kind: "none" } },
      },
    },
    {
      type: "run.finished",
      runId: "r",
      seq: 5,
      result: {
        kind: "failed",
        failure: { code: "BUILD", message: "Compilation failed", details: { kind: "none" } },
      },
    },
  ] as const;
  const announcements = [];
  for (const event of updates) {
    session.accept(event);
    const after = session.snapshot();
    announcements.push(htmlAnnouncement(before, after));
    before = after;
  }
  expect(announcements.map((entry) => entry?.text)).toEqual([
    "Run started: Build",
    undefined,
    "Task started: Compile",
    undefined,
    "Task failed: Compile. Compilation failed",
    "Run failed: Build. Compilation failed",
  ]);
  expect(announcements.at(-1)?.priority).toBe("assertive");
});
