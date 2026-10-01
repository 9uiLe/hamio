import { PresentationError } from "./error.ts";
import type { PresentationEvent, PresentationState } from "./model.ts";
import { PresentationSession } from "./session.ts";

export type ReplayResult =
  | { kind: "complete"; state: PresentationState }
  | { kind: "partial"; state: PresentationState; reason: string }
  | {
      kind: "invalid";
      acceptedPrefix: PresentationState;
      eventIndex: number;
      issue: PresentationError;
    };

export function replayEvents(
  events: Iterable<PresentationEvent>,
  recording: "complete" | "partial",
): ReplayResult {
  const session = new PresentationSession();
  let index = 0;
  for (const event of events) {
    try {
      session.accept(event);
    } catch (error) {
      if (!(error instanceof PresentationError)) throw error;
      return {
        kind: "invalid",
        acceptedPrefix: session.snapshot(),
        eventIndex: index,
        issue: error,
      };
    }
    index++;
  }
  return finishReplay(session, recording, index);
}

export function finishReplay(
  session: PresentationSession,
  recording: "complete" | "partial",
  index: number,
): ReplayResult {
  const state = session.snapshot();
  if (recording === "partial") return { kind: "partial", state, reason: "Recording is partial." };
  if (state.run.kind !== "present" || state.run.value.state.kind === "running") {
    return {
      kind: "invalid",
      acceptedPrefix: state,
      eventIndex: index,
      issue: new PresentationError("INVALID_STATE", "Complete recording has no finished run."),
    };
  }
  return { kind: "complete", state };
}
