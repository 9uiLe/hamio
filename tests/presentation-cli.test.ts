import { expect, test } from "bun:test";
import { productCommand } from "./support/command.ts";

async function cli(args: string[], input = "", env: Record<string, string> = {}) {
  const child = Bun.spawn(productCommand(["presentation", ...args]), {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
    timeout: 5000,
  });
  child.stdin.write(input);
  child.stdin.end();
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, stdout, stderr, response: () => JSON.parse(stdout) };
}

const frame = (seq: number, type: string, fields: Record<string, unknown> = {}) =>
  JSON.stringify({ protocolVersion: 2, runId: "demo", seq, type, ...fields });
const lines = (...frames: string[]) => `${frames.join("\n")}\n`;
const none = { kind: "none" };

test("Presentation discovery and static input use the production State", async () => {
  const capabilities = await cli(["capabilities"]);
  expect(capabilities.response()).toMatchObject({
    protocolVersion: 2,
    modes: ["static", "live"],
    renderer: "terminal",
  });
  const state = await cli(["static", "--input", "examples/presentation-static.json"]);
  expect(state.code).toBe(0);
  expect(state.response()).toEqual({
    protocolVersion: 2,
    status: "ok",
    runId: "build",
    runState: "succeeded",
  });
  expect(state.stderr).toContain("Compile sources");
  expect(state.stderr).toContain("Summary");
  expect(state.stderr).not.toContain("\u001b");
});

test("live uses accepted v2 events and process success is independent of business failure", async () => {
  const failure = {
    kind: "failed",
    failure: { code: "BUILD_FAILED", message: "Build failed.", details: none },
  };
  const result = await cli(
    ["live"],
    lines(
      frame(0, "run.started", { title: "Build" }),
      frame(1, "task.declared", {
        taskId: "compile",
        label: "Compile",
        placement: { kind: "root" },
      }),
      frame(2, "task.started", { taskId: "compile" }),
      frame(3, "task.progressed", {
        taskId: "compile",
        progress: { kind: "determinate", current: 1, total: 2 },
      }),
      frame(4, "task.finished", { taskId: "compile", result: failure }),
      frame(5, "run.finished", { result: failure }),
    ),
  );
  expect(result.code).toBe(0);
  expect(result.response()).toEqual({
    protocolVersion: 2,
    status: "ok",
    runId: "demo",
    runState: "failed",
    lastAcceptedSeq: 5,
  });
  expect(result.stderr).toContain("BUILD_FAILED");
  expect(result.stderr).not.toContain("\u001b");
});

test("invalid input keeps accepted prefix separate from business Result", async () => {
  const invalid = await cli(
    ["live"],
    lines(
      frame(0, "run.started", { title: "Build" }),
      frame(1, "task.started", { taskId: "missing" }),
    ),
  );
  expect(invalid.code).toBe(5);
  expect(invalid.response()).toMatchObject({
    protocolVersion: 2,
    status: "error",
    error: { code: "INVALID_TRANSITION" },
    accepted: { runId: "demo", lastAcceptedSeq: 0 },
  });
  expect(invalid.stderr).toContain("Build");
  expect(invalid.stderr).not.toContain("failed");

  const incomplete = await cli(["live"], lines(frame(0, "run.started", { title: "Build" })));
  expect(incomplete.code).toBe(5);
  expect(incomplete.response().error.code).toBe("INCOMPLETE_STREAM");
  expect(incomplete.response().accepted.lastAcceptedSeq).toBe(0);
  const unsupported = await cli(
    ["live"],
    lines(
      JSON.stringify({
        protocolVersion: 1,
        runId: "demo",
        seq: 0,
        type: "run.started",
        title: "Build",
      }),
    ),
  );
  expect(unsupported.code).toBe(2);
  expect(unsupported.response().error.code).toBe("UNSUPPORTED_VERSION");
  const extra = await cli(
    ["live"],
    lines(
      frame(0, "run.started", { title: "Build" }),
      frame(1, "run.finished", { result: { kind: "succeeded", data: none } }),
      frame(2, "content.published", { item: { kind: "message", level: "info", text: "late" } }),
    ),
  );
  expect(extra.code).toBe(5);
  expect(extra.response().accepted.lastAcceptedSeq).toBe(1);
  expect(extra.stderr).not.toContain("late");
});

test("arguments, byte limits and untrusted text have stable safe errors", async () => {
  expect((await cli(["live", "--no-motion", "--no-motion"])).response().error.code).toBe(
    "INVALID_ARGUMENT",
  );
  expect((await cli(["static"], "x".repeat(256 * 1024 + 1))).response().error.code).toBe(
    "LIMIT_EXCEEDED",
  );
  expect(
    (await cli(["static", "--input", "/definitely-absent-hamio-document"])).response().error.code,
  ).toBe("IO_ERROR");
  const secret = "DO_NOT_ECHO_SECRET";
  const malformed = await cli(
    ["live"],
    lines(frame(0, "run.started", { title: secret, extra: true })),
  );
  expect(malformed.response().error.code).toBe("INVALID_SHAPE");
  expect(malformed.stdout + malformed.stderr).not.toContain(secret);
});

test("redacted values never cross the public presentation boundary", async () => {
  const secret = "DO_NOT_ECHO_SECRET";
  const state = {
    protocolVersion: 2,
    state: {
      run: { kind: "none" },
      items: [
        {
          kind: "key-value",
          entries: [{ key: "token", label: "Token", value: { kind: "redacted" } }],
        },
      ],
    },
  };
  const visible = await cli(["static"], JSON.stringify(state));
  expect(visible.code).toBe(0);
  expect(visible.stderr).toContain("[redacted]");
  const rejected = await cli(
    ["static"],
    JSON.stringify({
      ...state,
      state: {
        ...state.state,
        items: [
          {
            kind: "key-value",
            entries: [{ key: "token", label: "Token", value: { kind: "redacted", value: secret } }],
          },
        ],
      },
    }),
  );
  expect(rejected.response().error.code).toBe("INVALID_SHAPE");
  expect(rejected.stdout + rejected.stderr).not.toContain(secret);
});

test("process interruption does not declare a cancelled Run", async () => {
  const child = Bun.spawn(productCommand(["presentation", "live"]), {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 5000,
  });
  child.stdin.write(lines(frame(0, "run.started", { title: "Still working" })));
  await Bun.sleep(150);
  child.kill("SIGINT");
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(code).toBe(130);
  expect(JSON.parse(stdout)).toMatchObject({
    protocolVersion: 2,
    status: "error",
    error: { code: "INTERRUPTED" },
    accepted: { runId: "demo", lastAcceptedSeq: 0 },
  });
  expect(stderr).toContain("Still working");
  expect(stdout).not.toContain('"runState":"cancelled"');
});
