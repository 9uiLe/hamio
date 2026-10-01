import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PresentationSession } from "../src/presentation/session.ts";
import { decodeEventLine } from "../src/protocol/decode.ts";
import { encodeEvent } from "../src/protocol/encode.ts";
import { headerLine, trailerLine } from "../src/recording/format.ts";
import { readRecording } from "../src/recording/reader.ts";
import { reportHtml, writeReport } from "../src/application/presentation-report.ts";
import { RecordingWriter } from "../src/recording/writer.ts";

const frame = (seq: number, type: string, fields: Record<string, unknown> = {}) =>
  JSON.stringify({ protocolVersion: 2, runId: "r", seq, type, ...fields });
const start = frame(0, "run.started", { title: "Run <script>" });
const finish = frame(1, "run.finished", { result: { kind: "succeeded", data: { kind: "none" } } });
const complete = `${headerLine}${start}\n${finish}\n${trailerLine("complete", 2, 1)}`;

async function fixture(body: string, check: (path: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "hamio-recording-"));
  const path = join(dir, "run.ndjson");
  try {
    await writeFile(path, body);
    await check(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("canonical event encoder discards non-wire properties and round trips", () => {
  const source = decodeEventLine(frame(0, "run.started", { title: "Safe" }));
  Object.assign(source, { internalSecret: "should-not-record" });
  const encoded = encodeEvent(source);
  expect(encoded).not.toContain("internalSecret");
  expect(decodeEventLine(encoded)).toEqual({
    type: "run.started",
    runId: "r",
    seq: 0,
    title: "Safe",
  });
});

test("writer stores only accepted canonical events and replay uses the same Session", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hamio-recording-"));
  const path = join(dir, "run.ndjson");
  try {
    const writer = await RecordingWriter.create(path);
    const session = new PresentationSession();
    for (const line of [start, finish]) {
      const event = decodeEventLine(line);
      session.accept(event);
      await writer.append(event);
    }
    await writer.finish("complete");
    const replay = await readRecording(path);
    expect(replay.kind).toBe("complete");
    if (replay.kind !== "complete") throw new Error("Expected complete replay.");
    expect(replay.state).toEqual(session.snapshot());
    expect(replay.eventCount).toBe(2);
    const raw = await readFile(path, "utf8");
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(raw).toBe(complete);
    expect(raw).not.toContain("\u001b");
    await expect(RecordingWriter.create(path)).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test.each([
  ["empty", "", "invalid", 0],
  ["header only", headerLine, "partial", 0],
  ["explicit empty partial", `${headerLine}${trailerLine("partial", 0, null)}`, "partial", 0],
  ["valid prefix", `${headerLine}${start}\n`, "partial", 1],
  ["incomplete final JSON", `${headerLine}${start}\n${finish.slice(0, -3)}`, "partial", 1],
  ["complete event without newline", `${headerLine}${start}\n${finish}`, "partial", 1],
  ["finished without trailer", `${headerLine}${start}\n${finish}\n`, "partial", 2],
  ["valid complete", complete, "complete", 2],
  ["CRLF header", headerLine.replace("\n", "\r\n"), "invalid", 0],
  [
    "unknown header field",
    headerLine.replace('"kind":"header"', '"kind":"header","extra":1'),
    "invalid",
    0,
  ],
  ["oversized header", `${headerLine.slice(0, -2)},"extra":"${"x".repeat(5000)}"}\n`, "invalid", 0],
  ["wrong count", `${headerLine}${start}\n${trailerLine("partial", 2, 0)}`, "invalid", 1],
  ["wrong sequence", `${headerLine}${start}\n${trailerLine("partial", 1, 9)}`, "invalid", 1],
  ["duplicate trailer", `${complete}${trailerLine("complete", 2, 1)}`, "invalid", 2],
  ["event after trailer", `${complete}${start}\n`, "invalid", 2],
  ["bytes after trailer", `${complete}{"kind":`, "invalid", 2],
  [
    "unknown trailer field",
    `${headerLine}${start}\n${trailerLine("partial", 1, 0).replace('"lastSeq":0', '"lastSeq":0,"extra":1')}`,
    "invalid",
    1,
  ],
  [
    "oversized event",
    `${headerLine}${frame(0, "run.started", { title: "x".repeat(70_000) })}\n`,
    "invalid",
    0,
  ],
  [
    "invalid middle event",
    `${headerLine}${start}\n${frame(1, "task.started", { taskId: "missing" })}\n${finish}\n`,
    "invalid",
    1,
  ],
  [
    "unknown version",
    headerLine.replace('"recordingVersion":1', '"recordingVersion":99'),
    "invalid",
    0,
  ],
  [
    "unsupported protocol",
    headerLine.replace('"protocolVersion":2', '"protocolVersion":99'),
    "invalid",
    0,
  ],
  ["second header", `${headerLine}${start}\n${headerLine}`, "invalid", 1],
  [
    "complete without finished run",
    `${headerLine}${start}\n${trailerLine("complete", 1, 0)}`,
    "invalid",
    1,
  ],
] as const)("reader classifies %s", async (_name, body, expected, count) => {
  await fixture(body, async (path) => {
    const result = await readRecording(path);
    expect(result.kind).toBe(expected);
    expect(result.eventCount).toBe(count);
  });
});

test("partial terminal Run stays succeeded; report metadata remains separate and safe", async () => {
  await fixture(`${headerLine}${start}\n${finish}\n`, async (path) => {
    const replay = await readRecording(path);
    expect(replay.kind).toBe("partial");
    if (replay.kind !== "partial") throw new Error("Expected partial replay.");
    expect(replay.state.run.kind).toBe("present");
    if (replay.state.run.kind === "present")
      expect(replay.state.run.value.state.kind).toBe("succeeded");
    const html = reportHtml(replay);
    expect(html).toContain("Recording");
    expect(html).toContain("incomplete");
    expect(html).toContain("succeeded");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    const output = `${path}.html`;
    await writeReport(output, replay);
    expect((await stat(output)).mode & 0o777).toBe(0o600);
    expect(await readFile(output, "utf8")).toBe(html);
    await expect(writeReport(output, replay)).rejects.toMatchObject({ code: "EEXIST" });
  });
});

test("report cancellation does not publish a final artifact", async () => {
  await fixture(complete, async (path) => {
    const replay = await readRecording(path);
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    const output = `${path}.html`;
    await expect(writeReport(output, replay, controller.signal)).rejects.toThrow("cancelled");
    expect(await Bun.file(output).exists()).toBe(false);
    await expect(readRecording(path, controller.signal)).rejects.toThrow();
  });
});

test.each(["failed", "cancelled"] as const)(
  "complete %s Result remains distinct from Recording complete",
  async (kind) => {
    const result =
      kind === "failed"
        ? {
            kind,
            failure: { code: "BUILD_FAILED", message: "Build failed.", details: { kind: "none" } },
          }
        : { kind, reason: "Stopped by caller." };
    const end = frame(1, "run.finished", { result });
    await fixture(
      `${headerLine}${start}\n${end}\n${trailerLine("complete", 2, 1)}`,
      async (path) => {
        const replay = await readRecording(path);
        expect(replay.kind).toBe("complete");
        if (replay.kind !== "complete" || replay.state.run.kind !== "present")
          throw new Error("Expected finished Run.");
        expect(replay.state.run.value.state.kind).toBe(kind);
        expect(reportHtml(replay)).toContain(kind);
      },
    );
  },
);
