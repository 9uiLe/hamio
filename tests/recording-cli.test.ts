import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { productCommand } from "./support/command.ts";

const start = '{"protocolVersion":2,"runId":"demo","seq":0,"type":"run.started","title":"Build"}';
const finish =
  '{"protocolVersion":2,"runId":"demo","seq":1,"type":"run.finished","result":{"kind":"succeeded","data":{"kind":"none"}}}';

async function cli(args: string[], input = "") {
  const child = Bun.spawn(productCommand(["presentation", ...args]), {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 5000,
  });
  child.stdin.write(input);
  child.stdin.end();
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, response: JSON.parse(stdout), stderr };
}

test("public live records a complete Run then report composes the same status", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hamio-record-cli-"));
  try {
    const file = join(dir, "run.ndjson");
    const html = join(dir, "report.html");
    const live = await cli(["live", "--record", file], `${start}\n${finish}\n`);
    expect(live.code).toBe(0);
    expect(live.response.recording).toMatchObject({
      status: "complete",
      eventCount: 2,
      lastRecordedSeq: 1,
    });
    expect(live.stderr).toContain("succeeded");
    const report = await cli(["report", "--input", file, "--output", html]);
    expect(report.code).toBe(0);
    expect(report.response).toMatchObject({
      status: "ok",
      runState: "succeeded",
      recording: { status: "complete", eventCount: 2 },
    });
    const document = await readFile(html, "utf8");
    expect(document).toContain("Recording complete");
    expect(document).toContain("Run result");
    expect(document).not.toContain("<script");
    expect((await cli(["report", "--input", file, "--output", html])).response.error.code).toBe(
      "INVALID_ARGUMENT",
    );
    expect((await cli(["live", "--record", file], `${start}\n${finish}\n`)).response).toMatchObject(
      { error: { code: "INVALID_ARGUMENT" }, recording: { writeStatus: "not_created" } },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("invalid following input records a valid partial prefix without rejected bytes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hamio-record-cli-"));
  try {
    const file = join(dir, "run.ndjson");
    const html = join(dir, "report.html");
    const invalid =
      '{"protocolVersion":2,"runId":"demo","seq":1,"type":"run.finished","result":{"kind":"failed","failure":{"code":"BAD","message":"never-store-raw-token","details":{"kind":"none"}},"raw":"rejected"}}';
    const live = await cli(["live", "--record", file], `${start}\n${invalid}\n`);
    expect(live.code).toBe(2);
    expect(live.response.recording).toMatchObject({
      writeStatus: "partial",
      eventCount: 1,
      lastRecordedSeq: 0,
    });
    const raw = await readFile(file, "utf8");
    expect(raw).not.toContain("never-store-raw-token");
    expect(raw).not.toContain("rejected");
    const report = await cli(["report", "--input", file, "--output", html]);
    expect(report.response).toMatchObject({
      status: "ok",
      runState: "running",
      recording: { status: "partial" },
    });
    expect(await readFile(html, "utf8")).toContain("Recording incomplete");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("EOF before run.finished closes a partial trailer without cancelling the Run", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hamio-record-cli-"));
  try {
    const file = join(dir, "run.ndjson");
    const html = join(dir, "report.html");
    const live = await cli(["live", "--record", file], `${start}\n`);
    expect(live.code).toBe(5);
    expect(live.response).toMatchObject({
      error: { code: "INCOMPLETE_STREAM" },
      recording: { writeStatus: "partial", eventCount: 1 },
    });
    const report = await cli(["report", "--input", file, "--output", html]);
    expect(report.response).toMatchObject({
      status: "ok",
      runState: "running",
      recording: { status: "partial" },
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("invalid Recording produces an inspection report for its accepted prefix", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hamio-record-cli-"));
  try {
    const file = join(dir, "broken.ndjson");
    const html = join(dir, "report.html");
    await writeFile(
      file,
      '{"recordingVersion":1,"protocolVersion":2,"kind":"header"}\n' +
        start +
        '\n{"invalid":true}\n',
    );
    const report = await cli(["report", "--input", file, "--output", html]);
    expect(report.code).toBe(0);
    expect(report.response.recording).toMatchObject({
      status: "invalid",
      eventCount: 1,
      issue: { line: 3 },
    });
    const document = await readFile(html, "utf8");
    expect(document).toContain("Recording invalid");
    expect(document).not.toContain('"invalid":true');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("invalid input after run.finished yields a partial Recording with succeeded Run", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hamio-record-cli-"));
  try {
    const file = join(dir, "run.ndjson");
    const html = join(dir, "report.html");
    const live = await cli(["live", "--record", file], `${start}\n${finish}\n{"bad":"frame"}\n`);
    expect(live.code).toBe(2);
    expect(live.response).toMatchObject({
      status: "error",
      accepted: { lastAcceptedSeq: 1 },
      recording: { writeStatus: "partial", eventCount: 2, lastRecordedSeq: 1 },
    });
    const report = await cli(["report", "--input", file, "--output", html]);
    expect(report.response).toMatchObject({
      status: "ok",
      runState: "succeeded",
      recording: { status: "partial" },
    });
    expect(await readFile(html, "utf8")).toContain("Recording incomplete");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("public report replays a Recording larger than the static document limit", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hamio-record-cli-"));
  try {
    const file = join(dir, "long.ndjson");
    const html = join(dir, "report.html");
    const frames = [start];
    frames.push(
      '{"protocolVersion":2,"runId":"demo","seq":1,"type":"task.declared","taskId":"work","label":"Work","placement":{"kind":"root"}}',
    );
    frames.push(
      '{"protocolVersion":2,"runId":"demo","seq":2,"type":"task.started","taskId":"work"}',
    );
    for (let index = 0; index < 2000; index++)
      frames.push(
        JSON.stringify({
          protocolVersion: 2,
          runId: "demo",
          seq: index + 3,
          type: "task.progressed",
          taskId: "work",
          progress: { kind: "determinate", current: index, total: 2000 },
        }),
      );
    frames.push(
      JSON.stringify({
        protocolVersion: 2,
        runId: "demo",
        seq: 2003,
        type: "task.finished",
        taskId: "work",
        result: { kind: "succeeded", data: { kind: "none" } },
      }),
    );
    frames.push(
      JSON.stringify({
        protocolVersion: 2,
        runId: "demo",
        seq: 2004,
        type: "run.finished",
        result: { kind: "succeeded", data: { kind: "none" } },
      }),
    );
    const live = await cli(["live", "--record", file], `${frames.join("\n")}\n`);
    expect(live.code).toBe(0);
    expect((await readFile(file)).byteLength).toBeGreaterThan(256 * 1024);
    const report = await cli(["report", "--input", file, "--output", html]);
    expect(report.response).toMatchObject({
      status: "ok",
      recording: { status: "complete", eventCount: 2005, lastRecordedSeq: 2004 },
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
