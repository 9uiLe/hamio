import { stripVTControlCharacters } from "node:util";

const controls = /[\p{Cc}\u202a-\u202e\u2066-\u2069]/u;
const unsafeCharacters = /[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu;
export function safeText(text: string): string {
  return controls.test(text) ? stripVTControlCharacters(text).replace(unsafeCharacters, "�") : text;
}
let segments: Intl.Segmenter | undefined;
export function fit(text: string, width: number): string {
  const safe = safeText(text);
  if (Bun.stringWidth(safe) <= width) return safe;
  let value = "";
  let length = 0;
  segments ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
  for (const { segment } of segments.segment(safe)) {
    const next = Bun.stringWidth(segment);
    if (length + next > Math.max(0, width - 1)) break;
    value += segment;
    length += next;
  }
  return `${value}…`;
}
