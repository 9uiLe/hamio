export const recordingVersion = 1;

// 64 KiB events allow 2 million progress updates within 512 MiB even at ~250 B each.
// The byte bound also covers unusually large accepted ContentItems without retaining history.
export const recordingLimits = {
  bytes: 512 * 1024 * 1024,
  events: 2_000_000,
  metadataBytes: 4096,
} as const;

export type RecordingStatus = "complete" | "partial" | "invalid";

export const headerLine = `${JSON.stringify({ recordingVersion, protocolVersion: 2, kind: "header" })}\n`;

export function trailerLine(
  status: "complete" | "partial",
  eventCount: number,
  lastSeq: number | null,
): string {
  return `${JSON.stringify({ recordingVersion, kind: "trailer", status, eventCount, lastSeq })}\n`;
}
