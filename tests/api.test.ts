import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import { limits } from "../src/core/contract.ts";
import { resolveForm } from "../src/core/form.ts";
import { Output } from "../src/adapters/output.ts";
import { readEvents } from "../src/adapters/input.ts";
import { Session } from "../src/core/session.ts";
import { decodeDisplay, decodeEvent, decodeForm, parseJson } from "../src/core/validation.ts";

const displayDefinition = (value: unknown) => decodeDisplay(JSON.stringify(value));
const eventDefinition = (value: unknown) => decodeEvent(JSON.stringify(value));
const formDefinition = (value: unknown) => decodeForm(JSON.stringify(value));

const definition = {
  apiVersion: 1,
  id: "test",
  fields: [
    { id: "name", kind: "text", label: "名前", minLength: 1, maxLength: 5 },
    { id: "ok", kind: "confirm", label: "確認" },
    { id: "choice", kind: "select", label: "選択", options: [{ value: "a", label: "A" }] },
    {
      id: "many",
      kind: "multiselect",
      label: "複数",
      options: [{ value: "a", label: "A" }],
      default: ["a"],
    },
    { id: "secret", kind: "secret", label: "秘密", required: false },
  ],
};
async function cli(args: string[], input = "") {
  const child = Bun.spawn(
    [process.execPath, "--no-env-file", "--no-install", "src/cli.ts", ...args],
    {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      timeout: 5000,
    },
  );
  child.stdin.write(input);
  child.stdin.end();
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, stdout, stderr, json: () => JSON.parse(stdout) };
}
async function withForm(action: (path: string) => Promise<void>, value: unknown = definition) {
  const directory = await mkdtemp(join(tmpdir(), "hamio-api-"));
  const path = join(directory, "form.json");
  try {
    await Bun.write(path, JSON.stringify(value));
    await action(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
const valid = { name: "日本語", ok: false, choice: "a" };
function event(type: string, seq: number, data: Record<string, unknown> = {}) {
  return { apiVersion: 1, runId: "run", seq, type, ...data };
}
function ndjson(events: unknown[]) {
  return `${events.map((item) => JSON.stringify(item)).join("\n")}\n`;
}

test("form returns equal values, defaults and false without interactive input", async () => {
  await withForm(async (path) => {
    const result = await cli(
      ["form", "--definition", path, "--values", "-", "--interactive", "never"],
      JSON.stringify(valid),
    );
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.json()).toEqual({
      apiVersion: 1,
      status: "ok",
      id: "test",
      values: { ...valid, many: ["a"] },
    });
  });
});
test("missing, invalid and secret answers never leak partial values", async () => {
  await withForm(async (path) => {
    const missing = await cli(["form", "--definition", path, "--interactive", "never"]);
    expect(missing.code).toBe(3);
    expect(missing.json().missing).toEqual(["name", "ok", "choice"]);
    const invalid = await cli(
      ["form", "--definition", path, "--values", "-"],
      JSON.stringify({ ...valid, secret: "do-not-echo", name: "too long" }),
    );
    expect(invalid.code).toBe(4);
    expect(invalid.json().issues[0].code).toBe("LENGTH");
    expect(invalid.stdout + invalid.stderr).not.toContain("do-not-echo");
    const duplicate = resolveForm(formDefinition(definition), { ...valid, many: ["a", "a"] });
    expect(duplicate.status).toBe("invalid_values");
  });
});
test("closed definitions reject unsupported versions, constraints, IDs and defaults", () => {
  expect(() => formDefinition({ ...definition, apiVersion: 2 })).toThrow("apiVersion");
  expect(() =>
    formDefinition({
      ...definition,
      fields: [{ id: "a", kind: "text", label: "a", pattern: ".*" }],
    }),
  ).toThrow("unknown property");
  expect(() =>
    formDefinition({ ...definition, fields: [{ id: "constructor", kind: "text", label: "a" }] }),
  ).toThrow("identifier");
  expect(() =>
    formDefinition({
      ...definition,
      fields: [{ id: "s", kind: "secret", label: "s", default: "hidden" }],
    }),
  ).toThrow("secret default");
  expect(() =>
    formDefinition({ ...definition, fields: [definition.fields[0], definition.fields[0]] }),
  ).toThrow("unique");
  expect(() => parseJson('{"__proto__":{"polluted":true}}')).toThrow("reserved");
  expect(() => parseJson('{"x":9007199254740992}')).toThrow("safe");
  expect(() => parseJson('"\\ud800"')).toThrow("Unicode");
});
test("JSON and structure limits fail before rendering", async () => {
  const oversized = await cli(["render", "--format", "json"], " ".repeat(limits.documentBytes + 1));
  expect(oversized.code).toBe(6);
  expect(oversized.stderr).toBe("");
  expect(() => parseJson(`${"[".repeat(18)}0${"]".repeat(18)}`)).toThrow("limit");
  expect(() =>
    displayDefinition({
      apiVersion: 1,
      blocks: Array.from({ length: 33 }, () => ({ kind: "message", level: "info", text: "a" })),
    }),
  ).toThrow("limit");
  expect((await cli(["render"], "{")).code).toBe(2);
});
test("display redacts designated data in both modes and sanitizes terminal control", async () => {
  const payload = {
    apiVersion: 1,
    blocks: [
      { kind: "message", level: "info", text: "safe\u001b]52;c;danger\u0007\u001b[31mvalue\u202e" },
      { kind: "key-value", items: [{ label: "secret", value: "do-not-echo", secret: true }] },
      {
        kind: "table",
        columns: [{ id: "key", label: "key", secret: true }],
        rows: [{ key: "do-not-echo" }],
      },
    ],
  };
  const machine = await cli(["render", "--format", "json"], JSON.stringify(payload));
  expect(machine.code).toBe(0);
  expect(machine.stderr).toBe("");
  expect(machine.json().blocks[0].text).toBe(payload.blocks[0]?.text);
  expect(machine.stdout).not.toContain("do-not-echo");
  const human = await cli(
    ["render", "--format", "human", "--color", "never"],
    JSON.stringify(payload),
  );
  expect(human.code).toBe(0);
  expect(human.stderr).not.toContain("\u001b");
  expect(human.stderr).not.toContain("\u202e");
  expect(human.stderr).not.toContain("do-not-echo");
  expect(human.stderr).toContain("[redacted]");
  expect(human.json()).toEqual({ apiVersion: 1, status: "ok" });
});
test("stream validates lifecycle and preserves business failure separately from UI success", async () => {
  const events = [
    event("run.start", 0, { title: "build" }),
    event("task.start", 1, { taskId: "a", label: "build" }),
    event("task.progress", 2, { taskId: "a", current: 1, total: 2 }),
    event("task.finish", 3, { taskId: "a", status: "failed" }),
    event("message", 4, { level: "warning", text: "check result" }),
    event("run.finish", 5, { result: { success: false } }),
  ];
  const result = await cli(["stream", "--format", "json"], ndjson(events));
  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout.trim().split("\n")).toHaveLength(1);
  expect(result.json().result.success).toBe(false);
  expect(result.json().tasks).toEqual({ succeeded: 0, failed: 1 });
  expect(result.json().warnings).toEqual([{ level: "warning", text: "check result" }]);
  const observed = await cli(["stream", "--format", "json", "--events"], ndjson(events));
  expect(observed.stdout.trim().split("\n")).toHaveLength(events.length + 1);
});
test("stream rejects EOF, ordering, interleaved runs and finished task updates", async () => {
  const start = event("run.start", 0, { title: "test" });
  for (const events of [
    [],
    [start],
    [start, start],
    [start, event("task.start", 2, { taskId: "a", label: "a" })],
    [start, event("run.finish", 1, { runId: "other", result: { success: true } })],
    [
      start,
      event("task.start", 1, { taskId: "a", label: "a" }),
      event("task.finish", 2, { taskId: "a", status: "succeeded" }),
      event("task.progress", 3, { taskId: "a", current: 1, total: 1 }),
    ],
  ]) {
    const result = await cli(["stream", "--format", "json"], events.length ? ndjson(events) : "");
    expect(result.code).toBe(5);
    expect(result.json().error.code).toBe("PROTOCOL_ERROR");
  }
});
test("stream keeps constant machine output and frees completed task detail", async () => {
  const events = [
    event("run.start", 0, { title: "load" }),
    event("task.start", 1, { taskId: "a", label: "load" }),
  ];
  for (let i = 1; i <= 2000; i++)
    events.push(event("task.progress", i + 1, { taskId: "a", current: i, total: 2000 }));
  events.push(
    event("task.finish", 2002, { taskId: "a", status: "succeeded" }),
    event("run.finish", 2003, { result: { success: true } }),
  );
  const result = await cli(["stream", "--format", "json"], ndjson(events));
  expect(result.code).toBe(0);
  expect(Buffer.byteLength(result.stdout)).toBeLessThan(256);
  expect(result.stderr).toBe("");
  const session = new Session();
  for (const raw of events) session.accept(eventDefinition(raw));
  expect(session.snapshot().active).toBe(0);
  expect(() =>
    session.accept(eventDefinition(event("message", 2004, { level: "info", text: "late" }))),
  ).toThrow("finished");
});
test("stream enforces active task and warning limits without losing critical notices", () => {
  for (const kind of ["tasks", "warnings"]) {
    const session = new Session();
    session.accept(eventDefinition(event("run.start", 0, { title: "limit" })));
    for (let i = 1; i <= 100; i++)
      session.accept(
        eventDefinition(
          kind === "tasks"
            ? event("task.start", i, { taskId: `t${i}`, label: "a" })
            : event("message", i, { level: "error", text: "important" }),
        ),
      );
    expect(() =>
      session.accept(
        eventDefinition(
          kind === "tasks"
            ? event("task.start", 101, { taskId: "overflow", label: "a" })
            : event("message", 101, { level: "warning", text: "important" }),
        ),
      ),
    ).toThrow("limit");
  }
});
test("NDJSON handles split UTF-8, CRLF, trailing frame and oversized partial frames", async () => {
  const bytes = Buffer.from('{"text":"日本語"}\r\n{"last":true}');
  const result: unknown[] = [];
  for await (const value of readEvents(
    Readable.from(Array.from(bytes, (byte) => Buffer.from([byte]))),
    new AbortController().signal,
  ))
    for (const line of value) result.push(parseJson(line));
  expect(result).toEqual([{ text: "日本語" }, { last: true }]);
  const consume = async (bytes: Buffer) => {
    for await (const batch of readEvents(Readable.from([bytes]), new AbortController().signal)) {
      for (const line of batch) parseJson(line);
    }
  };
  await expect(consume(Buffer.alloc(limits.frameBytes + 1, 32))).rejects.toThrow("limit");
  await expect(consume(Buffer.from([0xff, 10]))).rejects.toThrow("UTF-8");
});
test("slow and closed output fail within a deadline", async () => {
  const stalled = new Writable({ write() {} });
  const output = new Output(stalled, 30);
  await expect(output.write("data")).rejects.toThrow("deadline");
  output.close();
  stalled.destroy();
  const closed = new Writable({
    write(_chunk, _encoding, callback) {
      callback(new Error("closed"));
    },
  });
  const writer = new Output(closed);
  await expect(writer.write("data")).rejects.toThrow("output");
  await Bun.sleep(0);
  writer.close();
});
test("capabilities are selective and invalid flags do not expose argument values", async () => {
  const result = await cli(["capabilities", "--section", "forms"]);
  expect(result.code).toBe(0);
  expect(result.json().forms).toContain("secret");
  expect(result.json().limits).toBeUndefined();
  const bad = await cli(["render", "--private-token"]);
  expect(bad.code).toBe(2);
  expect(bad.stdout).not.toContain("private-token");
});

interface Step {
  wait: string;
  send?: string;
  signal?: "SIGTERM";
}
async function pty(path: string, steps: Step[]) {
  const directory = await mkdtemp(join(tmpdir(), "hamio-pty-"));
  const reply = join(directory, "reply.json");
  let text = "";
  let remaining = "";
  let index = 0;
  let child: ReturnType<typeof Bun.spawn> | undefined;
  try {
    child = Bun.spawn(
      [
        "sh",
        "-c",
        'reply=$1; shift; exec "$@" > "$reply"',
        "hamio-test",
        reply,
        process.execPath,
        "--no-env-file",
        "--no-install",
        resolve("src/cli.ts"),
        "form",
        "--definition",
        path,
        "--interactive",
        "always",
        "--color",
        "never",
      ],
      {
        env: { PATH: process.env.PATH ?? "", TERM: "xterm-256color", HOME: directory },
        timeout: 5000,
        terminal: {
          cols: 80,
          rows: 24,
          data(terminal, data) {
            const chunk = new TextDecoder().decode(data);
            text += chunk;
            remaining += chunk;
            const step = steps[index];
            if (step && remaining.includes(step.wait)) {
              remaining = "";
              index++;
              if (step.send) terminal.write(step.send);
              if (step.signal) child?.kill(step.signal);
            }
          },
        },
      },
    );
    const code = await child.exited;
    return { code, text, response: await Bun.file(reply).json(), steps: index };
  } finally {
    child?.terminal?.close();
    await rm(directory, { recursive: true, force: true });
  }
}
test("real TTY routes UI to stderr, returns answers to stdout and masks secrets", async () => {
  await withForm(
    async (path) => {
      const result = await pty(path, [
        { wait: "名前", send: "demo\r" },
        { wait: "確認", send: "\r" },
        { wait: "選択", send: "\r" },
        { wait: "秘密", send: "super-secret\r" },
      ]);
      expect(result.code).toBe(0);
      expect(result.steps).toBe(4);
      expect(result.response.values).toEqual({
        name: "demo",
        ok: false,
        choice: "a",
        many: ["a"],
        secret: "super-secret",
      });
      expect(result.text).not.toContain("super-secret");
      expect(result.text).toContain("\u001b[?25h");
      expect(result.text).not.toContain("\u001b[32m");
    },
    { ...definition, fields: definition.fields.map((field) => ({ ...field, required: true })) },
  );
});
test("TTY Ctrl-C, EOF and SIGTERM cancel without returning partial answers", async () => {
  await withForm(async (path) => {
    for (const step of [
      { wait: "名前", send: "\u0003" },
      { wait: "名前", send: "\u0004" },
      { wait: "名前", signal: "SIGTERM" as const },
    ]) {
      const result = await pty(path, [step]);
      expect(result.code).toBe(130);
      expect(result.response).toEqual({ apiVersion: 1, status: "cancelled" });
      expect(result.text).toContain("\u001b[?25h");
    }
  });
});

test("run.finish completes without waiting for stdin EOF", async () => {
  const child = Bun.spawn(
    [process.execPath, "--no-env-file", "--no-install", "src/cli.ts", "stream", "--format", "json"],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe", timeout: 2000 },
  );
  child.stdin.write(
    ndjson([
      event("run.start", 0, { title: "test" }),
      event("run.finish", 1, { result: { success: true } }),
    ]),
  );
  child.stdin.flush();
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(code).toBe(0);
  expect(JSON.parse(stdout).status).toBe("ok");
  expect(stderr).toBe("");
});

test("progress cannot regress or change total and task IDs cannot be reused", () => {
  const session = new Session();
  const apply = (value: unknown) => session.accept(eventDefinition(value));
  apply(event("run.start", 0, { title: "test" }));
  apply(event("task.start", 1, { taskId: "a", label: "a" }));
  apply(event("task.progress", 2, { taskId: "a", current: 2, total: 3 }));
  expect(() => apply(event("task.progress", 3, { taskId: "a", current: 1, total: 3 }))).toThrow(
    "increase",
  );
  expect(() => apply(event("task.progress", 3, { taskId: "a", current: 2, total: 4 }))).toThrow(
    "same total",
  );
  expect(() => apply(event("run.finish", 3, { result: { success: true } }))).toThrow("active");
  apply(event("task.finish", 3, { taskId: "a", status: "succeeded" }));
  expect(() => apply(event("task.start", 4, { taskId: "a", label: "again" }))).toThrow("reused");
});

test("TTY supports Japanese text and multiple selection, and bounds pasted input", async () => {
  await withForm(
    async (path) => {
      const result = await pty(path, [
        { wait: "名前", send: "日本語\r" },
        { wait: "複数", send: " \r" },
      ]);
      expect(result.code).toBe(0);
      expect(result.response.values).toEqual({ name: "日本語", many: ["a"] });
      const oversized = await pty(path, [{ wait: "名前", send: "a".repeat(17 * 1024) }]);
      expect(oversized.code).toBe(6);
      expect(oversized.response.error.code).toBe("LIMIT_EXCEEDED");
    },
    {
      apiVersion: 1,
      id: "input",
      fields: [
        definition.fields[0],
        {
          id: "many",
          kind: "multiselect",
          label: "複数",
          options: [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
          ],
        },
      ],
    },
  );
});
