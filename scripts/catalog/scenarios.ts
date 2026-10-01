import type {
  Cell,
  ContentItem,
  PresentationEvent,
  PresentationState,
  SourceExtent,
  TaskState,
} from "../../src/presentation/model.ts";
import { PresentationSession } from "../../src/presentation/session.ts";
import { validateState } from "../../src/presentation/validate.ts";

export interface Scenario {
  id: string;
  name: string;
  category: "Run / Task" | "Progress" | "Message / Result" | "Table" | "Content";
  description: string;
  intent: string;
  covers: readonly string[];
  source:
    | { kind: "state"; state: PresentationState }
    | { kind: "events"; events: readonly PresentationEvent[] };
}

const absent = { kind: "none" } as const;
const failure = { code: "BUILD_FAILED", message: "Compilation failed", details: absent } as const;
const succeeded = { kind: "succeeded", data: absent } as const;
const failed = { kind: "failed", failure } as const;
const cancelled = { kind: "cancelled", reason: "Stopped by the caller" } as const;
const visible = (value: string | number | boolean | null) => ({ kind: "visible", value }) as const;
const redacted = { kind: "redacted" } as const;
const complete = { kind: "complete" } as const;

function staticState(items: readonly ContentItem[]): PresentationState {
  return { run: absent, items };
}

function taskEvents(state: TaskState): PresentationEvent[] {
  const runId = "catalog-run";
  const taskId = "catalog-task";
  const events: PresentationEvent[] = [
    { type: "run.started", runId, seq: 0, title: "Package release" },
    {
      type: "task.declared",
      runId,
      seq: 1,
      taskId,
      label: "Compile sources",
      placement: { kind: "root" },
    },
  ];
  if (state.kind === "pending") return events;
  if (state.kind === "cancelled") {
    events.push({ type: "task.finished", runId, seq: events.length, taskId, result: state });
    return events;
  }
  events.push({ type: "task.started", runId, seq: events.length, taskId });
  if (state.kind === "running") {
    if (state.progress.kind !== "none")
      events.push({
        type: "task.progressed",
        runId,
        seq: events.length,
        taskId,
        progress: state.progress,
      });
  } else events.push({ type: "task.finished", runId, seq: events.length, taskId, result: state });
  return events;
}

function taskScenario(
  id: string,
  name: string,
  state: TaskState,
  covers: readonly string[],
  intent: string,
): Scenario {
  return {
    id,
    name,
    category: state.kind === "running" ? "Progress" : "Run / Task",
    description: `Run 中の Task が ${name} の状態。`,
    intent,
    covers,
    source: { kind: "events", events: taskEvents(state) },
  };
}

const longText =
  "A long diagnostic value stays available at narrow widths. It should wrap without losing the original source content or changing SourceExtent.";
const columns = [
  { key: "name", label: "Name" },
  { key: "value", label: "Value" },
] as const;
const table = (rows: readonly (readonly Cell[])[], extent: SourceExtent = complete) =>
  ({ kind: "table", columns, rows, extent }) as const;

export const scenarios: readonly Scenario[] = [
  taskScenario(
    "task-pending",
    "Task pending",
    { kind: "pending" },
    ["task.pending", "run.running"],
    "Declared before work starts",
  ),
  taskScenario(
    "task-running-none",
    "Task running, no progress",
    { kind: "running", progress: absent },
    ["task.running", "progress.none"],
    "No progress estimate exists",
  ),
  taskScenario(
    "task-running-indeterminate",
    "Task running, indeterminate",
    { kind: "running", progress: { kind: "indeterminate" } },
    ["progress.indeterminate"],
    "Work is active without a total",
  ),
  taskScenario(
    "task-running-zero",
    "Task running, 0 of 4",
    { kind: "running", progress: { kind: "determinate", current: 0, total: 4 } },
    ["progress.zero"],
    "Zero is distinct from no progress",
  ),
  taskScenario(
    "task-running-partial",
    "Task running, 2 of 4",
    { kind: "running", progress: { kind: "determinate", current: 2, total: 4 } },
    ["progress.partial"],
    "Known progress with work remaining",
  ),
  taskScenario(
    "task-running-complete",
    "Task running, 4 of 4",
    { kind: "running", progress: { kind: "determinate", current: 4, total: 4 } },
    ["progress.complete"],
    "Full progress does not finish the Task",
  ),
  taskScenario(
    "task-succeeded",
    "Task succeeded",
    succeeded,
    ["task.succeeded"],
    "Terminal Task remains in State",
  ),
  taskScenario(
    "task-failed",
    "Task failed",
    failed,
    ["task.failed"],
    "Failure code and message remain visible",
  ),
  taskScenario(
    "task-cancelled",
    "Task cancelled",
    cancelled,
    ["task.cancelled"],
    "A pending Task may be cancelled",
  ),
  {
    id: "run-group-mixed",
    name: "Group with mixed completed Tasks",
    category: "Run / Task",
    description:
      "A TaskGroup keeps a failed Task and a succeeded Task while the Run succeeds independently.",
    intent: "Check grouping, completed history, and independent Run result",
    covers: ["run.group", "run.mixed", "run.succeeded", "run.independent"],
    source: {
      kind: "events",
      events: [
        { type: "run.started", runId: "r", seq: 0, title: "Deployment" },
        { type: "task-group.declared", runId: "r", seq: 1, groupId: "g", label: "Checks" },
        {
          type: "task.declared",
          runId: "r",
          seq: 2,
          taskId: "a",
          label: "Unit tests",
          placement: { kind: "group", groupId: "g" },
        },
        { type: "task.started", runId: "r", seq: 3, taskId: "a" },
        { type: "task.finished", runId: "r", seq: 4, taskId: "a", result: failed },
        {
          type: "task.declared",
          runId: "r",
          seq: 5,
          taskId: "b",
          label: "Package",
          placement: { kind: "group", groupId: "g" },
        },
        { type: "task.started", runId: "r", seq: 6, taskId: "b" },
        { type: "task.finished", runId: "r", seq: 7, taskId: "b", result: succeeded },
        { type: "run.finished", runId: "r", seq: 8, result: succeeded },
      ],
    },
  },
  {
    id: "run-failed",
    name: "Run failed",
    category: "Run / Task",
    description: "The caller declares a failed Run with structured Failure information.",
    intent: "Inspect the Run Failure independently of Task state",
    covers: ["run.failed"],
    source: {
      kind: "events",
      events: [
        { type: "run.started", runId: "r", seq: 0, title: "Deployment" },
        { type: "run.finished", runId: "r", seq: 1, result: failed },
      ],
    },
  },
  {
    id: "run-cancelled",
    name: "Run cancelled",
    category: "Run / Task",
    description: "The caller declares cancellation, separate from a partial recording.",
    intent: "Read the reason without inferring an input interruption",
    covers: ["run.cancelled"],
    source: {
      kind: "events",
      events: [
        { type: "run.started", runId: "r", seq: 0, title: "Deployment" },
        { type: "run.finished", runId: "r", seq: 1, result: cancelled },
      ],
    },
  },
  {
    id: "run-empty-finished",
    name: "Empty finished Run",
    category: "Run / Task",
    description: "A Run may finish without Tasks.",
    intent: "Verify empty completion remains explicit",
    covers: ["run.empty"],
    source: {
      kind: "events",
      events: [
        { type: "run.started", runId: "r", seq: 0, title: "No work" },
        { type: "run.finished", runId: "r", seq: 1, result: succeeded },
      ],
    },
  },
  {
    id: "messages-all-levels",
    name: "Message levels",
    category: "Message / Result",
    description: "Info, success, warning, and error are messages, not Run results.",
    intent: "Every level must be readable as text",
    covers: ["message.info", "message.success", "message.warning", "message.error"],
    source: {
      kind: "state",
      state: staticState([
        { kind: "message", level: "info", text: "Starting checks" },
        { kind: "message", level: "success", text: "Cache ready" },
        { kind: "message", level: "warning", text: "Using fallback source" },
        { kind: "message", level: "error", text: "Could not read optional metadata" },
      ]),
    },
  },
  {
    id: "results-all-states",
    name: "Result states",
    category: "Message / Result",
    description: "Success with no data, success with JSON null/data, Failure, and cancellation.",
    intent: "Distinguish absence, JSON value, failure, and cancellation",
    covers: [
      "result.succeeded.none",
      "result.succeeded.value",
      "result.failed",
      "result.cancelled",
    ],
    source: {
      kind: "state",
      state: staticState([
        { kind: "result", result: succeeded },
        {
          kind: "result",
          result: {
            kind: "succeeded",
            data: { kind: "value", value: { count: 3, missing: null } },
          },
        },
        { kind: "result", result: failed },
        { kind: "result", result: cancelled },
        { kind: "failure", failure },
      ]),
    },
  },
  {
    id: "table-small-empty",
    name: "Small and empty Tables",
    category: "Table",
    description: "A small comparison and a valid table with no rows.",
    intent: "Headers and empty row state remain visible",
    covers: ["table.small", "table.empty"],
    source: {
      kind: "state",
      state: staticState([
        table([
          [visible("alpha"), visible(1)],
          [visible("beta"), visible(2)],
        ]),
        table([]),
      ]),
    },
  },
  {
    id: "table-large-truncated",
    name: "Large, source-truncated Table",
    category: "Table",
    description:
      "Many rows are present, and the source states that more rows were omitted before rendering.",
    intent: "Keep source truncation distinct from viewport wrapping",
    covers: ["table.large", "table.truncated"],
    source: {
      kind: "state",
      state: staticState([
        table(
          Array.from({ length: 24 }, (_, index) => [visible(`entry-${index + 1}`), visible(index)]),
          { kind: "truncated", omittedCount: 7 },
        ),
      ]),
    },
  },
  {
    id: "table-narrow-long-redacted",
    name: "Narrow Table with long and redacted cells",
    category: "Table",
    description:
      "The same long value must survive narrow inspection; a redacted cell contains no secret value.",
    intent: "Inspect wrapping and redaction without changing the source extent",
    covers: ["table.narrow", "table.long", "table.redacted"],
    source: {
      kind: "state",
      state: staticState([
        table([
          [visible(longText), redacted],
          [visible("short"), visible(null)],
        ]),
      ]),
    },
  },
  {
    id: "code-diff",
    name: "Code and Diff",
    category: "Content",
    description: "Code and line-classified Diff include an empty Code and a source-truncated Diff.",
    intent: "Long lines and source extent remain inspectable",
    covers: ["code.normal", "code.empty", "diff.normal", "diff.truncated", "content.long"],
    source: {
      kind: "state",
      state: staticState([
        { kind: "code", text: `const answer = 42;\n${longText}`, language: "ts", extent: complete },
        { kind: "code", text: "", extent: complete },
        {
          kind: "diff",
          lines: [
            { kind: "context", text: " function run() {" },
            { kind: "removed", text: "-  return oldValue;" },
            { kind: "added", text: "+  return newValue;" },
          ],
          extent: { kind: "truncated", omittedCount: 2 },
        },
      ]),
    },
  },
  {
    id: "tree-keyvalue-summary",
    name: "Tree, KeyValue, and Summary",
    category: "Content",
    description: "Nested tree structure, empty KeyValue, redacted value, and summary points.",
    intent: "Inspect hierarchy, empty content, and explicit redaction",
    covers: [
      "tree.nested",
      "tree.truncated",
      "keyvalue.normal",
      "keyvalue.empty",
      "keyvalue.redacted",
      "summary.normal",
    ],
    source: {
      kind: "state",
      state: staticState([
        {
          kind: "tree",
          nodes: [
            {
              label: "workspace",
              children: [{ label: "src", children: [{ label: "main.ts", children: [] }] }],
            },
          ],
          extent: { kind: "truncated" },
        },
        {
          kind: "key-value",
          entries: [
            { key: "token", label: "Token", value: redacted },
            { key: "count", label: "Count", value: visible(3) },
          ],
        },
        { kind: "key-value", entries: [] },
        {
          kind: "summary",
          headline: "Inspection complete",
          points: ["No values inferred from color", "The source contains a nested tree"],
        },
        { kind: "redacted" },
      ]),
    },
  },
  {
    id: "content-cjk",
    name: "Japanese and grapheme text",
    category: "Content",
    description:
      "Japanese, full-width, emoji, and combining marks remain readable at narrow widths.",
    intent: "Inspect actual Terminal glyph widths and HTML text without losing characters",
    covers: ["content.cjk"],
    source: {
      kind: "state",
      state: staticState([
        { kind: "message", level: "info", text: "日本語の進捗: 全角ＡＢＣ 👩‍💻 é 確認済み" },
      ]),
    },
  },
] as const;

export function resolveScenario(scenario: Scenario): PresentationState {
  try {
    if (scenario.source.kind === "state") {
      validateState(scenario.source.state);
      return structuredClone(scenario.source.state);
    }
    const session = new PresentationSession();
    for (const event of scenario.source.events) session.accept(event);
    const state = session.snapshot();
    validateState(state);
    return state;
  } catch (error) {
    throw new Error(
      `Scenario ${scenario.id} (${scenario.source.kind}) is invalid: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

export function scenarioById(id: string): Scenario {
  const scenario = scenarios.find((entry) => entry.id === id);
  if (!scenario) throw new Error(`Unknown scenario: ${id}`);
  return scenario;
}
