import { randomUUID } from "node:crypto";
import { link, open, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { RecordedReplay } from "../recording/reader.ts";
import { renderRecordingReport } from "../renderers/html.ts";

export function reportHtml(replay: RecordedReplay): string {
  const state = replay.kind === "invalid" ? replay.acceptedPrefix : replay.state;
  return renderRecordingReport(state, {
    status: replay.kind,
    eventCount: replay.eventCount,
    lastSeq: replay.lastSeq,
    ...(replay.kind === "invalid" ? { issue: { line: replay.line, code: replay.issue.code } } : {}),
  });
}

/** Link publishes the fully written file without replacing an existing report. */
export async function writeReport(
  path: string,
  replay: RecordedReplay,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw signal.reason;
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  const file = await open(temporary, "wx", 0o600);
  try {
    try {
      await file.writeFile(reportHtml(replay), "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    if (signal?.aborted) throw signal.reason;
    await link(temporary, path);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
