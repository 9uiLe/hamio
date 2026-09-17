import type { Appearance } from "../application/command.ts";
import { paint } from "./format.ts";
import { fit, safeText } from "./text.ts";

export type PromptState = "initial" | "active" | "cancel" | "submit" | "error" | "validating";
export interface PromptFrame {
  readonly state: PromptState;
  readonly label: string;
  readonly lines: readonly string[];
  readonly answer: string;
  readonly error: string;
  readonly instruction?: string;
}

/** Receives display values only; secret answers must already be masked by the adapter. */
export function promptFrame(frame: PromptFrame, appearance: Appearance): string {
  const { state, label } = frame;
  const ended = state === "submit" || state === "cancel";
  const symbol = state === "cancel" ? "×" : state === "error" ? "▲" : ended ? "◇" : "◆";
  const color = state === "cancel" ? 31 : state === "error" ? 33 : ended ? 90 : 36;
  const header = `${paint(symbol, color, appearance.color)} ${fit(label, appearance.width - 2)}`;
  const body = ended ? [state === "cancel" ? "キャンセル" : frame.answer] : frame.lines;
  const lines = body.map(
    (line) => `${paint("│", color, appearance.color)} ${fit(line, appearance.width - 2)}`,
  );
  if (state === "error")
    lines.push(`${paint("│", color, appearance.color)} ${fit(frame.error, appearance.width - 2)}`);
  if (!ended && frame.instruction)
    lines.push(
      `${paint("│", color, appearance.color)} ${fit(frame.instruction, appearance.width - 2)}`,
    );
  return `${header}\n${lines.join("\n")}\n${paint(ended ? "│" : "└", color, appearance.color)}\n`;
}

export function optionLines(
  options: readonly { label: string; value: string }[],
  cursor: number,
  selected: readonly string[] | undefined,
  rows: number,
): string[] {
  const size = Math.min(8, Math.max(1, rows - 6));
  const start = Math.max(0, Math.min(cursor - Math.floor(size / 2), options.length - size));
  const lines = options.slice(start, start + size).map((option, offset) => {
    const focused = start + offset === cursor;
    const mark = selected ? (selected.includes(option.value) ? "■" : "□") : focused ? "●" : "○";
    return `${focused ? "›" : " "} ${mark} ${option.label}`;
  });
  if (options.length > size) lines.push(`${cursor + 1} / ${options.length}`);
  return lines;
}

export function inputLine(value: string, cursor: number, width: number): string {
  // Inspect a bounded window even when one paste produces thousands of key events.
  let from = Math.max(0, cursor - Math.max(1, width) * 2);
  const first = value.charCodeAt(from);
  if (from > 0 && first >= 0xdc00 && first <= 0xdfff) from--;
  const left = Array.from(safeText(value.slice(from, cursor)));
  const right = safeText(value.slice(cursor, cursor + Math.max(1, width) * 2));
  let start = 0;
  let used = Bun.stringWidth(left.join(""));
  while (used > Math.max(1, width - 3) && start < left.length) {
    used -= Bun.stringWidth(left[start] ?? "");
    start++;
  }
  return `${from || start ? "…" : ""}${left.slice(start).join("")}▏${right}`;
}
