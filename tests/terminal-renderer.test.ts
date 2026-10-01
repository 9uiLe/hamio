import { expect, test } from "bun:test";
import { Writable } from "node:stream";
import type { PresentationState, TreeNode } from "../src/presentation/model.ts";
import { TerminalLiveView, terminalPolicy } from "../src/renderers/terminal-live.ts";
import { renderTerminal } from "../src/renderers/terminal.ts";
import { resolveScenario, scenarioById } from "../scripts/catalog/scenarios.ts";

const plain = (columns: number) => ({ columns, color: false, animation: false });
const scenario = (id: string) => resolveScenario(scenarioById(id));

function output(): { stream: Writable; chunks: string[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      chunks.push(String(chunk));
      done();
    },
  });
  return { stream, chunks };
}

test("all shared scenarios render safely at 40 and 80 columns without changing State", () => {
  for (const id of [
    "task-pending",
    "task-running-none",
    "task-running-indeterminate",
    "task-running-zero",
    "task-running-partial",
    "task-running-complete",
    "task-succeeded",
    "task-failed",
    "task-cancelled",
    "run-group-mixed",
    "results-all-states",
    "table-large-truncated",
    "table-narrow-long-redacted",
    "code-diff",
    "tree-keyvalue-summary",
  ]) {
    const state = scenario(id);
    const copy = structuredClone(state);
    for (const columns of [40, 80]) {
      const rendered = renderTerminal(state, plain(columns));
      for (const line of rendered.trimEnd().split("\n"))
        expect(Bun.stringWidth(line)).toBeLessThan(columns);
      expect(rendered).not.toContain("\u001b");
    }
    expect(state).toEqual(copy);
  }
});

test("status, progress, Results, Failure, and redaction remain distinct in plain text", () => {
  expect(renderTerminal(scenario("task-pending"), plain(40))).toContain(". pending");
  const none = renderTerminal(scenario("task-running-none"), plain(40));
  expect(none).toContain("> running  Compile sources");
  expect(none).not.toContain("0/");
  expect(renderTerminal(scenario("task-running-indeterminate"), plain(40))).toMatch(
    /total\s+unknown/,
  );
  expect(renderTerminal(scenario("task-running-zero"), plain(40))).toContain("0/4");
  const full = renderTerminal(scenario("task-running-complete"), plain(40));
  expect(full).toContain("4/4");
  expect(full).toContain("running  Compile sources");
  expect(renderTerminal(scenario("task-failed"), plain(40))).toContain("code: BUILD_FAILED");
  const results = renderTerminal(scenario("results-all-states"), plain(80));
  expect(results).toContain("no data");
  expect(results).toContain('"missing":null');
  expect(results).toContain("- cancelled");
  const table = renderTerminal(scenario("table-narrow-long-redacted"), plain(40));
  expect(table).toContain("[redacted]");
  expect(table).toContain("Value: null");
  expect(renderTerminal(scenario("table-large-truncated"), plain(40))).toContain(
    "source truncated; 7 omitted",
  );
});

test("CJK, emoji, combining marks, long text, and controls fit without control injection", () => {
  const state: PresentationState = {
    run: { kind: "none" },
    items: [
      {
        kind: "message",
        level: "warning",
        text: `${"日本語👩‍💻éとても長い文字列".repeat(4)} \r\u001b[31munsafe\u001b[0m\u202e`,
      },
      {
        kind: "diff",
        lines: [{ kind: "added", text: "+ changed" }],
        extent: { kind: "truncated" },
      },
    ],
  };
  const rendered = renderTerminal(state, plain(40));
  expect(rendered).toContain("日本語");
  expect(rendered).toContain("unsafe");
  for (const character of ["\u001b", "\r", "\u202e"]) expect(rendered).not.toContain(character);
  expect(rendered).toContain("+ + changed");
  expect(rendered).toContain("source truncated");
  for (const line of rendered.trimEnd().split("\n")) expect(Bun.stringWidth(line)).toBeLessThan(40);
});

test("deep Tree keeps ancestor context within a narrow column budget", () => {
  let node: TreeNode = { label: "leaf", children: [] };
  for (let depth = 0; depth < 15; depth++) node = { label: `branch-${depth}`, children: [node] };
  const state: PresentationState = {
    run: { kind: "none" },
    items: [{ kind: "tree", nodes: [node], extent: { kind: "complete" } }],
  };
  const rendered = renderTerminal(state, plain(40));
  expect(rendered).toContain("leaf");
  expect(rendered).toContain("branch-14");
  for (const line of rendered.trimEnd().split("\n")) expect(Bun.stringWidth(line)).toBeLessThan(40);
});

test("styling is applied only after wrapping, and environment policy separates color from motion", () => {
  const state = scenario("messages-all-levels");
  const colored = renderTerminal(state, { columns: 40, color: true, animation: false });
  const uncolored = renderTerminal(state, plain(40));
  expect(colored).toContain("\u001b[33m! warning");
  let withoutColor = colored;
  for (const code of [0, 31, 32, 33, 36])
    withoutColor = withoutColor.replaceAll(`${String.fromCharCode(27)}[${code}m`, "");
  expect(withoutColor).toBe(uncolored);
  expect(
    terminalPolicy({ tty: true, columns: 80, animation: true, env: { NO_COLOR: "1" } }),
  ).toEqual({ tty: true, columns: 80, color: false, animation: true });
  expect(terminalPolicy({ tty: false, columns: 80, animation: true, env: {} })).toEqual({
    tty: false,
    columns: 80,
    color: false,
    animation: false,
  });
});

test("non-TTY coalesces burst updates and appends only changed semantic lines", async () => {
  const sink = output();
  const view = new TerminalLiveView(sink.stream, {
    tty: false,
    columns: 40,
    color: false,
    animation: false,
  });
  const first = scenario("task-running-zero");
  const latest = scenario("task-running-partial");
  view.update(first);
  view.update(latest);
  await Bun.sleep(120);
  expect(sink.chunks.join("")).toContain("2/4");
  expect(sink.chunks.join("")).not.toContain("0/4");
  view.update(scenario("task-running-complete"));
  await view.close();
  const log = sink.chunks.join("");
  expect(log).toContain("4/4");
  expect(log.match(/Run: Package release/g)?.length).toBe(1);
  expect(log).not.toContain("\u001b");
});

test("TTY redraw stays in its owned rows, resize reflows, and completion stops motion", async () => {
  const sink = output();
  const view = new TerminalLiveView(sink.stream, {
    tty: true,
    columns: 80,
    color: true,
    animation: true,
  });
  view.update(scenario("task-running-partial"));
  for (let attempt = 0; attempt < 20 && sink.chunks.length === 0; attempt++) await Bun.sleep(20);
  expect(sink.chunks.length).toBeGreaterThan(0);
  view.update(scenario("task-running-complete"));
  for (let attempt = 0; attempt < 20 && !sink.chunks.join("").includes("\u001b[2K"); attempt++)
    await Bun.sleep(20);
  expect(sink.chunks.join("")).toContain("\u001b[2K");
  view.resize(40);
  view.update(scenario("task-succeeded"));
  await view.close();
  const combined = sink.chunks.join("");
  expect(combined).toContain("\u001b[36m");
  expect(combined).toContain("+ succeeded");
  expect(combined).not.toContain("\u001b[?25l");
  const count = sink.chunks.length;
  await Bun.sleep(300);
  expect(sink.chunks.length).toBe(count);
});

test("a frame taller than the viewport becomes append-only without clearing scrolled rows", async () => {
  const sink = output();
  const view = new TerminalLiveView(sink.stream, {
    tty: true,
    columns: 40,
    rows: 8,
    color: false,
    animation: true,
  });
  const state: PresentationState = {
    run: { kind: "present", value: { id: "r", title: "Large run", state: { kind: "running" } } },
    items: Array.from({ length: 20 }, (_, index) => ({
      kind: "task" as const,
      id: `t-${index}`,
      label: `Task ${index}`,
      state: { kind: "succeeded" as const, data: { kind: "none" as const } },
    })),
  };
  view.update(state);
  await Bun.sleep(130);
  view.update({
    ...state,
    items: [
      ...state.items,
      {
        kind: "task",
        id: "active",
        label: "Current work",
        state: { kind: "running", progress: { kind: "none" } },
      },
    ],
  });
  await view.close();
  const text = sink.chunks.join("");
  expect(text).toContain("Current work");
  expect(text).not.toContain("\u001b[2K");
  expect(text.match(/Task 0/g)?.length).toBe(1);
});

test("spinner cadence stays at or below four frames per second while idle", async () => {
  const times: number[] = [];
  const stream = new Writable({
    write(_chunk, _encoding, done) {
      times.push(performance.now());
      done();
    },
  });
  const view = new TerminalLiveView(stream, {
    tty: true,
    columns: 40,
    rows: 20,
    color: false,
    animation: true,
  });
  view.update(scenario("task-running-indeterminate"));
  await Bun.sleep(830);
  await view.close();
  expect(times.length).toBeGreaterThanOrEqual(3);
  for (let index = 1; index < times.length; index++)
    expect((times[index] ?? 0) - (times[index - 1] ?? 0)).toBeGreaterThanOrEqual(245);
});

test("slow writes are serialized and the latest snapshot wins", async () => {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      chunks.push(String(chunk));
      setTimeout(done, 60);
    },
  });
  const view = new TerminalLiveView(stream, {
    tty: true,
    columns: 40,
    rows: 20,
    color: false,
    animation: false,
  });
  view.update(scenario("task-running-zero"));
  await Bun.sleep(110);
  for (let current = 1; current <= 50; current++) {
    const state = scenario("task-running-zero");
    const item = state.items.find((entry) => entry.kind === "task");
    if (item?.state.kind === "running")
      item.state.progress = { kind: "determinate", current, total: 50 };
    view.update(state);
  }
  await view.close();
  expect(chunks.length).toBeLessThanOrEqual(2);
  expect(chunks.join("")).toContain("50/50");
});

test("write failure and abort leave no continuing timer or hidden cursor", async () => {
  const abort = new AbortController();
  const sink = output();
  const view = new TerminalLiveView(
    sink.stream,
    { tty: true, columns: 40, color: false, animation: true },
    abort.signal,
  );
  view.update(scenario("task-running-indeterminate"));
  await Bun.sleep(120);
  abort.abort();
  await Bun.sleep(350);
  const count = sink.chunks.length;
  await Bun.sleep(300);
  expect(sink.chunks.length).toBe(count);
  expect(sink.chunks.join("")).not.toContain("\u001b[?25l");

  const broken = new Writable({
    write(_chunk, _encoding, done) {
      done(new Error("sink closed"));
    },
  });
  const failed = new TerminalLiveView(broken, {
    tty: true,
    columns: 40,
    color: false,
    animation: true,
  });
  failed.update(scenario("task-running-none"));
  await expect(failed.close()).rejects.toThrow("sink closed");
});
