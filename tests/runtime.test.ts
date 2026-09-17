import { expect, test } from "bun:test";
import { Readable } from "node:stream";
import { readEvents } from "../src/adapters/input.ts";
import { TerminalView } from "../src/adapters/terminal.ts";
import { type Environment, parseCommand } from "../src/application/command.ts";
import type { Ports } from "../src/application/ports.ts";
import { execute, reportFailure } from "../src/application/run.ts";
import { Cancelled } from "../src/core/contract.ts";
import { inputLine, optionLines } from "../src/terminal/prompt-view.ts";

const environment: Environment = {
  inputTTY: false,
  outputTTY: false,
  columns: 80,
  term: undefined,
  ci: undefined,
  noColor: undefined,
};
const appearance = { color: false, width: 80, live: true };
function event(type: string, seq: number, data: Record<string, unknown> = {}) {
  return JSON.stringify({ apiVersion: 1, runId: "run", seq, type, ...data });
}
function memoryPorts(overrides: Partial<Ports> = {}) {
  const writes: string[] = [];
  const controller = new AbortController();
  const ports: Ports = {
    signal: controller.signal,
    output: {
      async write(text) {
        writes.push(text);
      },
    },
    async readDocument() {
      throw new Error("Unexpected file access");
    },
    readEvents() {
      throw new Error("Unexpected event access");
    },
    async openView() {
      throw new Error("Unexpected terminal initialization");
    },
    async ask() {
      throw new Error("Unexpected prompt initialization");
    },
    ...overrides,
  };
  return { ports, writes, controller };
}

test("command policy is explicit and machine commands do not initialize terminals", async () => {
  const original = { ...process.env };
  const memory = memoryPorts();
  const command = parseCommand(["capabilities"], environment);
  expect(await execute(command, memory.ports)).toBe(0);
  expect(JSON.parse(memory.writes.join("")).commands).toContain("stream");
  expect(
    parseCommand(["form", "--definition", "form.json", "--values", "-"], {
      ...environment,
      inputTTY: true,
      outputTTY: true,
    }),
  ).toMatchObject({ interactive: false });
  expect(() => parseCommand(["stream", "--events", "--format", "human"], environment)).toThrow(
    "--events",
  );
  expect(process.env).toEqual(original);
});

test("concurrent application calls isolate replies, appearance, and cancellation", async () => {
  const definition = JSON.stringify({
    apiVersion: 1,
    id: "input",
    fields: [{ kind: "text", id: "name", label: "name" }],
  });
  const waiting = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const cancelled = memoryPorts({
    readDocument: async () => definition,
    async ask(_fields, _title, style) {
      expect(style.color).toBe(true);
      started.resolve();
      await waiting.promise;
      throw new Cancelled();
    },
  });
  const supplied = memoryPorts({
    readDocument: async (path) => (path === "definition" ? definition : '{"name":"independent"}'),
  });
  const first = execute(
    parseCommand(["form", "--definition", "definition", "--color", "always"], {
      ...environment,
      inputTTY: true,
      outputTTY: true,
    }),
    cancelled.ports,
  ).catch((error: unknown) => reportFailure(error, cancelled.ports.output));
  await started.promise;
  const second = await execute(
    parseCommand(
      ["form", "--definition", "definition", "--values", "values", "--color", "never"],
      environment,
    ),
    supplied.ports,
  );
  cancelled.controller.abort(new Cancelled());
  waiting.resolve();
  expect(await first).toBe(130);
  expect(second).toBe(0);
  expect(JSON.parse(cancelled.writes.join(""))).toEqual({ apiVersion: 1, status: "cancelled" });
  expect(JSON.parse(supplied.writes.join("")).values).toEqual({ name: "independent" });
});

test("event batching flushes before waiting for more input and preserves accepted events on failure", async () => {
  const next = Promise.withResolvers<void>();
  const delivered = Promise.withResolvers<void>();
  const writes: string[] = [];
  const memory = memoryPorts({
    output: {
      async write(text) {
        writes.push(text);
        delivered.resolve();
      },
    },
    async *readEvents() {
      yield [
        event("run.start", 0, { title: "test" }),
        event("message", 1, { level: "warning", text: "retain" }),
      ];
      await next.promise;
      yield [event("message", 3, { level: "info", text: "invalid sequence" })];
    },
  });
  const run = execute(parseCommand(["stream", "--events"], environment), memory.ports).catch(
    (error: unknown) => reportFailure(error, memory.ports.output),
  );
  await delivered.promise;
  expect(writes.join("").trim().split("\n")).toHaveLength(2);
  next.resolve();
  expect(await run).toBe(5);
  const lines = writes
    .join("")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(lines[1].event.text).toBe("retain");
  expect(lines[2].error.code).toBe("PROTOCOL_ERROR");
});

test("batched events keep order and bounded writes under a large producer burst", async () => {
  const lines = [event("run.start", 0, { title: "burst" })];
  for (let index = 1; index <= 2000; index++)
    lines.push(event("message", index, { level: "info", text: `message ${index}` }));
  lines.push(event("run.finish", 2001, { result: { success: true } }));
  const memory = memoryPorts({
    async *readEvents() {
      yield lines;
    },
  });
  expect(await execute(parseCommand(["stream", "--events"], environment), memory.ports)).toBe(0);
  const replies = memory.writes
    .join("")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(replies).toHaveLength(2003);
  expect(replies.slice(0, -1).map((reply) => reply.event.seq)).toEqual(
    Array.from({ length: 2002 }, (_, index) => index),
  );
  expect(memory.writes.length).toBeLessThan(25);
  expect(Math.max(...memory.writes.map((text) => Buffer.byteLength(text)))).toBeLessThan(17 * 1024);
});

test("run.finish stops decoding even when invalid trailing bytes share the input read", async () => {
  const input = Buffer.concat([
    Buffer.from(
      `${event("run.start", 0, { title: "test" })}\n${event("run.finish", 1, { result: { success: true } })}\n`,
    ),
    Buffer.from([0xff, 10]),
  ]);
  const controller = new AbortController();
  const memory = memoryPorts({
    readEvents: () => readEvents(Readable.from([input]), controller.signal),
  });
  expect(await execute(parseCommand(["stream"], environment), memory.ports)).toBe(0);
  expect(JSON.parse(memory.writes.join("")).status).toBe("ok");
});

test("progress reads only at drawing time and closes a slow destination without queued frames", async () => {
  const first = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const writes: string[] = [];
  let reads = 0;
  let current = 0;
  const view = new TerminalView(
    {
      async write(text) {
        writes.push(text);
        if (writes.length === 1) {
          first.resolve();
          await release.promise;
        }
      },
    },
    appearance,
    (error) => {
      throw error;
    },
  );
  const read = () => {
    reads++;
    return { first: { label: "work", current, total: 20_000 }, active: 1, succeeded: 0, failed: 0 };
  };
  for (; current < 10_000; current++) view.progress(read);
  expect(reads).toBe(0);
  await first.promise;
  expect(writes[0]).toContain("10000/20000");
  for (; current < 20_000; current++) view.progress(read);
  const closed = view.close();
  release.resolve();
  await closed;
  expect(reads).toBe(1);
  expect(writes).toHaveLength(2);
  view.progress(read);
  await Bun.sleep(120);
  expect(writes).toHaveLength(2);
});

test("prompt windows expose focused options and a cursor without reflecting terminal commands", () => {
  const options = Array.from({ length: 100 }, (_, index) => ({
    value: String(index),
    label: `option ${index}`,
  }));
  const lines = optionLines(options, 99, ["99"], 12);
  expect(lines).toContain("› ■ option 99");
  expect(lines).toContain("100 / 100");
  expect(lines.length).toBeLessThanOrEqual(7);
  const value = `${"x".repeat(4096)}\u001b[2J日本語`;
  const line = inputLine(value, value.length, 30);
  expect(line).not.toContain("\u001b");
  expect(line).toContain("日本語▏");
  expect(line.length).toBeLessThan(40);
});

test("progress failures reach cancellation and cleanup instead of escaping the timer", async () => {
  for (const failOnRead of [true, false]) {
    const aborted = Promise.withResolvers<unknown>();
    const failure = new Error("drawing failed");
    const view = new TerminalView(
      {
        write() {
          throw failure;
        },
      },
      appearance,
      aborted.resolve,
    );
    view.progress(() => {
      if (failOnRead) throw failure;
      return { first: undefined, active: 0, succeeded: 1, failed: 0 };
    });
    expect(await aborted.promise).toBe(failure);
    await expect(view.close()).rejects.toBe(failure);
  }
});
