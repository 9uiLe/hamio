import { expect, test } from "bun:test";
import { PresentationError } from "../src/presentation/error.ts";
import { PresentationSession } from "../src/presentation/session.ts";
import { decodeEventLine, decodeStatic } from "../src/protocol/decode.ts";
import { ProtocolError } from "../src/protocol/error.ts";
import { protocolLimits } from "../src/protocol/limits.ts";

function frame(seq: number, type: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ protocolVersion: 2, runId: "r", seq, type, ...extra });
}

test("v2 event frames decode to facts without v1 compatibility", () => {
  const started = decodeEventLine(frame(0, "run.started", { title: "Run" }));
  expect(started).toEqual({ type: "run.started", runId: "r", seq: 0, title: "Run" });
  const session = new PresentationSession();
  session.accept(started);
  session.accept(
    decodeEventLine(
      frame(1, "content.published", {
        item: {
          kind: "key-value",
          entries: [{ key: "token", label: "Token", value: { kind: "redacted" } }],
        },
      }),
    ),
  );
  session.accept(
    decodeEventLine(
      frame(2, "run.finished", {
        result: { kind: "succeeded", data: { kind: "value", value: null } },
      }),
    ),
  );
  expect(session.snapshot().items[0]).toEqual({
    kind: "key-value",
    entries: [{ key: "token", label: "Token", value: { kind: "redacted" } }],
  });
  expect(() =>
    decodeEventLine(
      JSON.stringify({ apiVersion: 1, runId: "r", seq: 0, type: "run.start", title: "Run" }),
    ),
  ).toThrow(ProtocolError);
});

test("closed shapes, versions, IDs, Unicode and byte limits reject untrusted frames", () => {
  const invalid = [
    frame(0, "run.started", { title: "Run", unexpected: true }),
    frame(0, "unknown", {}),
    frame(0, "task.started", { taskId: "__proto__" }),
    frame(0, "task.started", { taskId: 12 }),
    frame(-1, "run.started", { title: "Run" }),
    frame(0, "run.started", { title: "x".repeat(protocolLimits.stringBytes + 1) }),
    frame(0, "run.finished", { result: { kind: "failed" } }),
    frame(0, "content.published", { item: { kind: "message", level: "debug", text: "No" } }),
    frame(0, "content.published", {
      item: {
        kind: "key-value",
        entries: [{ key: "token", label: "Token", value: { kind: "redacted", value: "secret" } }],
      },
    }),
    '{"protocolVersion":2,"runId":"r","seq":0,"type":"run.started","title":"Run","__proto__":{}}',
    "{bad json}",
  ];
  for (const input of invalid) expect(() => decodeEventLine(input)).toThrow(ProtocolError);
  expect(() => decodeEventLine(new Uint8Array([0xff]))).toThrow(ProtocolError);
  expect(() => decodeEventLine(frame(0, "run.started", { title: "\ud800" }))).toThrow(
    ProtocolError,
  );
  expect(() => decodeEventLine(" ".repeat(protocolLimits.frameBytes + 1))).toThrow(ProtocolError);
  let nested: unknown = "deep";
  for (let depth = 0; depth <= protocolLimits.depth; depth++) nested = [nested];
  expect(() =>
    decodeStatic(
      JSON.stringify({ protocolVersion: 2, state: { run: { kind: "none" }, items: [nested] } }),
    ),
  ).toThrow(ProtocolError);
});

test("static semantic items decode without renderer vocabulary", () => {
  const items = [
    { kind: "message", level: "warning", text: "Warning" },
    { kind: "progress", label: "Work", progress: { kind: "indeterminate" } },
    { kind: "result", result: { kind: "succeeded", data: { kind: "none" } } },
    {
      kind: "failure",
      failure: { code: "BUILD", message: "Failed", details: { kind: "value", value: null } },
    },
    { kind: "code", text: "", extent: { kind: "complete" } },
    {
      kind: "diff",
      lines: [{ kind: "added", text: "+line" }],
      extent: { kind: "truncated", omittedCount: 2 },
    },
    { kind: "tree", nodes: [{ label: "root", children: [] }], extent: { kind: "complete" } },
    { kind: "summary", headline: "Done", points: [] },
    { kind: "redacted" },
  ];
  const state = decodeStatic(
    JSON.stringify({ protocolVersion: 2, state: { run: { kind: "none" }, items } }),
  );
  expect(items.map((item) => item.kind)).toEqual(state.items.map((item) => item.kind));
});

test("static State decoding applies domain invariants after protocol shape validation", () => {
  const valid = {
    protocolVersion: 2,
    state: {
      run: { kind: "present", value: { id: "r", title: "Run", state: { kind: "running" } } },
      items: [
        {
          kind: "task-group",
          id: "g",
          label: "Group",
          tasks: [{ kind: "task", id: "t", label: "Task", state: { kind: "pending" } }],
        },
        {
          kind: "table",
          columns: [{ key: "name", label: "Name" }],
          rows: [[{ kind: "redacted" }]],
          extent: { kind: "truncated", omittedCount: 1 },
        },
      ],
    },
  };
  expect(decodeStatic(JSON.stringify(valid)).items[0]?.kind).toBe("task-group");
  const duplicated = structuredClone(valid);
  duplicated.state.items.push({ kind: "task-group", id: "g", label: "Again", tasks: [] });
  expect(() => decodeStatic(JSON.stringify(duplicated))).toThrow(PresentationError);
  const finished = {
    protocolVersion: 2,
    state: {
      run: {
        kind: "present",
        value: { id: "r", title: "Run", state: { kind: "succeeded", data: { kind: "none" } } },
      },
      items: valid.state.items,
    },
  };
  expect(() => decodeStatic(JSON.stringify(finished))).toThrow(PresentationError);
  const badTable = {
    protocolVersion: 2,
    state: {
      run: valid.state.run,
      items: [
        valid.state.items[0],
        {
          kind: "table",
          columns: [{ key: "name", label: "Name" }],
          rows: [[{ kind: "redacted" }, { kind: "redacted" }]],
          extent: { kind: "complete" },
        },
      ],
    },
  };
  expect(() => decodeStatic(JSON.stringify(badTable))).toThrow(PresentationError);
  const badExtent = {
    protocolVersion: 2,
    state: {
      run: { kind: "none" },
      items: [{ kind: "code", text: "", extent: { kind: "truncated", omittedCount: 0 } }],
    },
  };
  expect(() => decodeStatic(JSON.stringify(badExtent))).toThrow(PresentationError);
  expect(() => decodeStatic(JSON.stringify({ protocolVersion: 1, state: valid.state }))).toThrow(
    ProtocolError,
  );
  expect(() =>
    decodeStatic(
      JSON.stringify({
        protocolVersion: 2,
        state: {
          run: { kind: "none" },
          items: [
            {
              kind: "progress",
              label: "P",
              progress: { kind: "determinate", current: 0, total: 0 },
            },
          ],
        },
      }),
    ),
  ).toThrow(PresentationError);
});
