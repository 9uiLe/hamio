import { expect, test } from "bun:test";
import { PresentationError } from "../src/presentation/error.ts";
import type {
  PresentationEvent,
  PresentationState,
  StructuredValue,
  TreeNode,
} from "../src/presentation/model.ts";
import { replayEvents } from "../src/presentation/replay.ts";
import { PresentationSession } from "../src/presentation/session.ts";
import { validateState } from "../src/presentation/validate.ts";

const none = { kind: "none" } as const;
const failure = { code: "BUILD", message: "Build failed", details: none } as const;

test("a declared group retains a completed task and Run result is independently declared", () => {
  const session = new PresentationSession();
  const events: PresentationEvent[] = [
    { type: "run.started", runId: "run-1", seq: 0, title: "Build" },
    { type: "task-group.declared", runId: "run-1", seq: 1, groupId: "group-1", label: "Compile" },
    {
      type: "task.declared",
      runId: "run-1",
      seq: 2,
      taskId: "task-1",
      label: "Compile A",
      placement: { kind: "group", groupId: "group-1" },
    },
    { type: "task.started", runId: "run-1", seq: 3, taskId: "task-1" },
    {
      type: "task.progressed",
      runId: "run-1",
      seq: 4,
      taskId: "task-1",
      progress: { kind: "indeterminate" },
    },
    {
      type: "task.progressed",
      runId: "run-1",
      seq: 5,
      taskId: "task-1",
      progress: { kind: "determinate", current: 0, total: 3 },
    },
    {
      type: "task.progressed",
      runId: "run-1",
      seq: 6,
      taskId: "task-1",
      progress: { kind: "determinate", current: 2, total: 3 },
    },
    {
      type: "task.finished",
      runId: "run-1",
      seq: 7,
      taskId: "task-1",
      result: { kind: "failed", failure },
    },
    { type: "run.finished", runId: "run-1", seq: 8, result: { kind: "succeeded", data: none } },
  ];
  for (const event of events) {
    session.accept(event);
    if (event.seq === 3 || event.seq === 4 || event.seq === 5) {
      const group = session.snapshot().items[0];
      if (group?.kind !== "task-group") throw new Error("Expected a group.");
      const task = group.tasks[0];
      if (task?.state.kind !== "running") throw new Error("Expected a running task.");
      if (event.seq === 3) expect(task.state.progress.kind).toBe("none");
      if (event.seq === 4) expect(task.state.progress.kind).toBe("indeterminate");
      if (event.seq === 5)
        expect(task.state.progress).toEqual({ kind: "determinate", current: 0, total: 3 });
    }
  }
  const live = session.snapshot();
  validateState(live);
  expect(live.run.kind).toBe("present");
  if (live.run.kind === "present") expect(live.run.value.state.kind).toBe("succeeded");
  expect(live.items[0]?.kind).toBe("task-group");
  const group = live.items[0];
  if (group?.kind === "task-group") expect(group.tasks[0]?.state.kind).toBe("failed");
  expect(replayEvents(events, "complete")).toEqual({ kind: "complete", state: live });
  expect(replayEvents(events, "partial")).toMatchObject({ kind: "partial", state: live });
});

test("rejected events leave state and sequence intact", () => {
  const session = new PresentationSession();
  session.accept({ type: "run.started", runId: "r", seq: 0, title: "Run" });
  session.accept({
    type: "task.declared",
    runId: "r",
    seq: 1,
    taskId: "t",
    label: "Task",
    placement: { kind: "root" },
  });
  session.accept({ type: "task.started", runId: "r", seq: 2, taskId: "t" });
  session.accept({
    type: "task.progressed",
    runId: "r",
    seq: 3,
    taskId: "t",
    progress: { kind: "determinate", current: 1, total: 3 },
  });
  const before = session.snapshot();
  const rejected: PresentationEvent[] = [
    {
      type: "task.progressed",
      runId: "r",
      seq: 3,
      taskId: "t",
      progress: { kind: "determinate", current: 2, total: 3 },
    },
    {
      type: "task.progressed",
      runId: "r",
      seq: 4,
      taskId: "t",
      progress: { kind: "determinate", current: 0, total: 3 },
    },
    {
      type: "task.progressed",
      runId: "r",
      seq: 4,
      taskId: "t",
      progress: { kind: "determinate", current: 1, total: 4 },
    },
    {
      type: "task.progressed",
      runId: "r",
      seq: 4,
      taskId: "t",
      progress: { kind: "indeterminate" },
    },
    { type: "task.finished", runId: "other", seq: 4, taskId: "t", result: { kind: "cancelled" } },
    { type: "run.finished", runId: "r", seq: 4, result: { kind: "cancelled" } },
    {
      type: "task.declared",
      runId: "r",
      seq: 4,
      taskId: "t",
      label: "Again",
      placement: { kind: "root" },
    },
    {
      type: "task.declared",
      runId: "r",
      seq: 4,
      taskId: "new",
      label: "New",
      placement: { kind: "group", groupId: "missing" },
    },
  ];
  for (const event of rejected) {
    expect(() => session.accept(event)).toThrow(PresentationError);
    expect(session.snapshot()).toEqual(before);
  }
  session.accept({
    type: "task.progressed",
    runId: "r",
    seq: 4,
    taskId: "t",
    progress: { kind: "determinate", current: 1, total: 3 },
  });
  session.accept({
    type: "task.finished",
    runId: "r",
    seq: 5,
    taskId: "t",
    result: { kind: "cancelled" },
  });
  session.accept({ type: "run.finished", runId: "r", seq: 6, result: { kind: "cancelled" } });
  expect(() =>
    session.accept({
      type: "content.published",
      runId: "r",
      seq: 7,
      item: { kind: "message", level: "info", text: "Late" },
    }),
  ).toThrow(PresentationError);
});

test("pending cancellation, explicit data presence, and detached snapshots", () => {
  const session = new PresentationSession();
  session.accept({ type: "run.started", runId: "r", seq: 0, title: "Run" });
  const input: PresentationEvent = {
    type: "content.published",
    runId: "r",
    seq: 1,
    item: { kind: "result", result: { kind: "succeeded", data: { kind: "value", value: null } } },
  };
  session.accept(input);
  if (input.type === "content.published" && input.item.kind === "result")
    input.item.result = { kind: "cancelled" };
  const snapshot = session.snapshot();
  const item = snapshot.items[0];
  expect(item).toEqual({
    kind: "result",
    result: { kind: "succeeded", data: { kind: "value", value: null } },
  });
  if (item?.kind === "result") item.result = { kind: "cancelled" };
  expect(session.snapshot().items[0]).toEqual({
    kind: "result",
    result: { kind: "succeeded", data: { kind: "value", value: null } },
  });
  session.accept({
    type: "task.declared",
    runId: "r",
    seq: 2,
    taskId: "t",
    label: "Pending",
    placement: { kind: "root" },
  });
  expect(session.snapshot().items[1]).toMatchObject({ kind: "task", state: { kind: "pending" } });
  expect(() =>
    session.accept({
      type: "task.finished",
      runId: "r",
      seq: 3,
      taskId: "t",
      result: { kind: "failed", failure },
    }),
  ).toThrow(PresentationError);
  session.accept({
    type: "task.finished",
    runId: "r",
    seq: 3,
    taskId: "t",
    result: { kind: "cancelled", reason: "Skipped" },
  });
  expect(() =>
    session.accept({
      type: "task.declared",
      runId: "r",
      seq: 4,
      taskId: "t",
      label: "Retry",
      placement: { kind: "root" },
    }),
  ).toThrow(PresentationError);
  session.accept({ type: "run.finished", runId: "r", seq: 4, result: { kind: "failed", failure } });
  expect(session.snapshot().items[1]?.kind).toBe("task");
});

test("static state rejects contradictory relationships and malformed semantic content", () => {
  const runningTask = {
    kind: "task",
    id: "t",
    label: "Task",
    state: { kind: "running", progress: { kind: "none" } },
  } as const;
  const state: PresentationState = {
    run: {
      kind: "present",
      value: { id: "r", title: "Run", state: { kind: "succeeded", data: none } },
    },
    items: [runningTask],
  };
  expect(() => validateState(state)).toThrow(PresentationError);
  expect(() => validateState({ run: { kind: "none" }, items: [runningTask] })).toThrow(
    PresentationError,
  );
  expect(() =>
    validateState({
      run: { kind: "present", value: { id: "r", title: "Run", state: { kind: "running" } } },
      items: [runningTask, runningTask],
    }),
  ).toThrow(PresentationError);
  expect(() =>
    validateState({
      run: { kind: "none" },
      items: [
        {
          kind: "table",
          columns: [{ key: "a", label: "A" }],
          rows: [[{ kind: "redacted" }, { kind: "visible", value: 2 }]],
          extent: { kind: "complete" },
        },
      ],
    }),
  ).toThrow(PresentationError);
  expect(() =>
    validateState({
      run: { kind: "none" },
      items: [
        {
          kind: "progress",
          label: "Work",
          progress: { kind: "determinate", current: 0, total: 0 },
        },
      ],
    }),
  ).toThrow(PresentationError);
  const cyclic: { label: string; children: TreeNode[] } = {
    label: "Root",
    children: [],
  };
  cyclic.children.push(cyclic);
  expect(() =>
    validateState({
      run: { kind: "none" },
      items: [{ kind: "tree", nodes: [cyclic], extent: { kind: "complete" } }],
    }),
  ).toThrow(PresentationError);
  let deep: StructuredValue = null;
  for (let index = 0; index < 18; index++) deep = [deep];
  expect(() =>
    validateState({
      run: { kind: "none" },
      items: [
        {
          kind: "result",
          result: { kind: "succeeded", data: { kind: "value", value: deep } },
        },
      ],
    }),
  ).toThrow(PresentationError);
});

test("partial and invalid replays preserve the accepted prefix", () => {
  const events: PresentationEvent[] = [
    { type: "run.started", runId: "r", seq: 0, title: "Run" },
    {
      type: "task.declared",
      runId: "r",
      seq: 1,
      taskId: "t",
      label: "Task",
      placement: { kind: "root" },
    },
    { type: "task.started", runId: "r", seq: 2, taskId: "t" },
  ];
  const partial = replayEvents(events, "partial");
  expect(partial.kind).toBe("partial");
  if (partial.kind === "partial") {
    expect(partial.state.run.kind).toBe("present");
    expect(partial.state.items[0]?.kind).toBe("task");
  }
  const invalid = replayEvents(
    [...events, { type: "task.started", runId: "r", seq: 3, taskId: "t" }],
    "complete",
  );
  expect(invalid.kind).toBe("invalid");
  if (invalid.kind === "invalid" && partial.kind === "partial") {
    expect(invalid.acceptedPrefix).toEqual(partial.state);
    expect(invalid.eventIndex).toBe(3);
  }
});
