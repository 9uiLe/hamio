import { createReadStream } from "node:fs";
import { PresentationError } from "../presentation/error.ts";
import type { PresentationState } from "../presentation/model.ts";
import { PresentationSession } from "../presentation/session.ts";
import { decodeEventLine } from "../protocol/decode.ts";
import { ProtocolError } from "../protocol/error.ts";
import { protocolLimits } from "../protocol/limits.ts";
import { recordingLimits, recordingVersion } from "./format.ts";

type RecordingIssue = ProtocolError | PresentationError;
export type RecordedReplay =
  | {
      kind: "complete" | "partial";
      state: PresentationState;
      reason?: string;
      eventCount: number;
      lastSeq: number | null;
      bytes: number;
    }
  | {
      kind: "invalid";
      acceptedPrefix: PresentationState;
      line: number;
      eventCount: number;
      lastSeq: number | null;
      bytes: number;
      issue: RecordingIssue;
    };

function invalidShape(message: string): never {
  throw new ProtocolError("INVALID_SHAPE", message);
}
function metadata(line: Buffer): Record<string, unknown> {
  if (line.byteLength > recordingLimits.metadataBytes)
    throw new ProtocolError("LIMIT_EXCEEDED", "Recording metadata line exceeds its limit.");
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(line));
  } catch {
    throw new ProtocolError("INVALID_JSON", "Recording metadata is not valid UTF-8 JSON.");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value))
    invalidShape("Recording metadata must be an object.");
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, expected: readonly string[]): void {
  if (
    Object.keys(value).length !== expected.length ||
    expected.some((key) => !Object.hasOwn(value, key))
  )
    invalidShape("Recording metadata shape is invalid.");
}
function header(line: Buffer): void {
  const value = metadata(line);
  keys(value, ["recordingVersion", "protocolVersion", "kind"]);
  if (value.recordingVersion !== recordingVersion)
    throw new ProtocolError("UNSUPPORTED_VERSION", "Recording version is unsupported.");
  if (value.protocolVersion !== 2)
    throw new ProtocolError(
      "UNSUPPORTED_VERSION",
      "Recording event protocol version is unsupported.",
    );
  if (value.kind !== "header") invalidShape("Recording must begin with a header.");
}
function trailer(line: Buffer): {
  status: "complete" | "partial";
  eventCount: number;
  lastSeq: number | null;
} {
  const value = metadata(line);
  keys(value, ["recordingVersion", "kind", "status", "eventCount", "lastSeq"]);
  if (value.recordingVersion !== recordingVersion)
    throw new ProtocolError("UNSUPPORTED_VERSION", "Recording version is unsupported.");
  if (value.kind !== "trailer" || (value.status !== "complete" && value.status !== "partial"))
    invalidShape("Recording trailer is invalid.");
  if (
    typeof value.eventCount !== "number" ||
    !Number.isSafeInteger(value.eventCount) ||
    value.eventCount < 0
  )
    invalidShape("Recording event count is invalid.");
  if (
    value.lastSeq !== null &&
    (typeof value.lastSeq !== "number" || !Number.isSafeInteger(value.lastSeq) || value.lastSeq < 0)
  )
    invalidShape("Recording final sequence is invalid.");
  return {
    status: value.status as "complete" | "partial",
    eventCount: value.eventCount,
    lastSeq: value.lastSeq as number | null,
  };
}

/** Streams bounded lines; a final fragment without newline is never an accepted frame. */
export async function readRecording(path: string, signal?: AbortSignal): Promise<RecordedReplay> {
  const session = new PresentationSession();
  let count = 0;
  let last: number | null = null;
  let bytes = 0;
  let lineNumber = 0;
  let seenHeader = false;
  let seenTrailer = false;
  let result: RecordedReplay | undefined;
  let rest = Buffer.alloc(0);
  const bad = (issue: RecordingIssue): RecordedReplay => ({
    kind: "invalid",
    acceptedPrefix: session.snapshot(),
    line: lineNumber,
    eventCount: count,
    lastSeq: last,
    bytes,
    issue,
  });
  const processLine = (line: Buffer): void => {
    lineNumber++;
    if (seenTrailer) {
      result = bad(new ProtocolError("INVALID_SHAPE", "Frame follows Recording trailer."));
      return;
    }
    try {
      if (line.at(-1) === 13) invalidShape("Recording uses LF framing, not CRLF.");
      if (!seenHeader) {
        header(line);
        seenHeader = true;
        return;
      }
      if (line.length === 0) invalidShape("Empty Recording frame.");
      // Parse only to identify the frame family; the protocol decoder remains the event validator.
      let candidate: unknown;
      try {
        candidate = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(line));
      } catch {
        candidate = undefined;
      }
      if (
        candidate !== null &&
        typeof candidate === "object" &&
        !Array.isArray(candidate) &&
        Object.hasOwn(candidate, "recordingVersion")
      ) {
        const end = trailer(line);
        if (end.eventCount !== count || end.lastSeq !== last)
          invalidShape("Recording trailer count or sequence does not match.");
        const state = session.snapshot();
        if (
          end.status === "complete" &&
          (state.run.kind !== "present" || state.run.value.state.kind === "running")
        ) {
          result = bad(
            new PresentationError("INVALID_STATE", "Complete recording has no finished run."),
          );
          return;
        }
        seenTrailer = true;
        result = {
          kind: end.status,
          state,
          ...(end.status === "partial" ? { reason: "Recording is partial." } : {}),
          eventCount: count,
          lastSeq: last,
          bytes,
        };
        return;
      }
      if (count >= recordingLimits.events)
        throw new ProtocolError("LIMIT_EXCEEDED", "Recording event count exceeds its limit.");
      if (line.byteLength > protocolLimits.frameBytes)
        throw new ProtocolError("LIMIT_EXCEEDED", "Recording event line exceeds its limit.");
      const event = decodeEventLine(line);
      session.accept(event);
      count++;
      last = event.seq;
    } catch (error) {
      if (!(error instanceof ProtocolError) && !(error instanceof PresentationError)) throw error;
      result = bad(error);
    }
  };
  const stream = createReadStream(path, { highWaterMark: 64 * 1024, signal });
  try {
    for await (const chunk of stream) {
      bytes += chunk.byteLength;
      if (bytes > recordingLimits.bytes) {
        lineNumber++;
        result = bad(new ProtocolError("LIMIT_EXCEEDED", "Recording byte limit exceeded."));
        break;
      }
      let start = 0;
      for (let end = chunk.indexOf(10, start); end !== -1; end = chunk.indexOf(10, start)) {
        const part = chunk.subarray(start, end);
        if (rest.length + part.length > protocolLimits.frameBytes + 1) {
          lineNumber++;
          result = bad(new ProtocolError("LIMIT_EXCEEDED", "Recording line exceeds its limit."));
          break;
        }
        processLine(rest.length === 0 ? part : Buffer.concat([rest, part]));
        rest = Buffer.alloc(0);
        if (result?.kind === "invalid") break;
        start = end + 1;
      }
      if (result?.kind === "invalid") break;
      const tail = chunk.subarray(start);
      if (rest.length + tail.length > protocolLimits.frameBytes + 1) {
        lineNumber++;
        result = bad(new ProtocolError("LIMIT_EXCEEDED", "Recording line exceeds its limit."));
        break;
      }
      if (tail.length) rest = rest.length === 0 ? Buffer.from(tail) : Buffer.concat([rest, tail]);
    }
  } finally {
    stream.destroy();
  }
  if (result?.kind === "invalid") return result;
  if (!seenHeader) {
    lineNumber++;
    return bad(new ProtocolError("INVALID_SHAPE", "Recording header is missing or incomplete."));
  }
  if (seenTrailer) {
    if (rest.length) {
      lineNumber++;
      return bad(new ProtocolError("INVALID_SHAPE", "Bytes follow Recording trailer."));
    }
    return result as RecordedReplay;
  }
  return {
    kind: "partial",
    state: session.snapshot(),
    reason: rest.length ? "Incomplete final frame was discarded." : "Recording trailer is absent.",
    eventCount: count,
    lastSeq: last,
    bytes,
  };
}
