import { stripVTControlCharacters } from "node:util";
import type { Block, Level, Result } from "./contract.ts";
import type { Output } from "./io.ts";

export function safeText(text: string): string {
  let result = "";
  for (const character of stripVTControlCharacters(text)) {
    const code = character.codePointAt(0) ?? 0;
    if (
      code < 32 ||
      (code >= 127 && code <= 159) ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
    )
      result += "�";
    else result += character;
  }
  return result;
}
const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" });
export function fit(text: string, width: number): string {
  const safe = safeText(text);
  if (Bun.stringWidth(safe) <= width) return safe;
  let value = "";
  let length = 0;
  for (const { segment } of segments.segment(safe)) {
    const next = Bun.stringWidth(segment);
    if (length + next > Math.max(0, width - 1)) break;
    value += segment;
    length += next;
  }
  return `${value}…`;
}
export function redacted(block: Block): Block {
  if (block.kind === "key-value")
    return {
      ...block,
      items: block.items.map((item) => ({
        ...item,
        value: item.secret ? "[redacted]" : item.value,
      })),
    };
  if (block.kind === "table")
    return {
      ...block,
      rows: block.rows.map((row) =>
        Object.fromEntries(
          block.columns.map((column) => [
            column.id,
            column.secret ? "[redacted]" : (row[column.id] ?? null),
          ]),
        ),
      ),
    };
  return block;
}
export class Display {
  constructor(
    readonly output: Output,
    readonly color: boolean,
    readonly width = 80,
  ) {}
  private paint(text: string, code: number) {
    return this.color ? `\u001b[${code}m${text}\u001b[0m` : text;
  }
  async message(level: Level, text: string) {
    const styles = {
      info: ["●", 36],
      success: ["✓", 32],
      warning: ["▲", 33],
      error: ["✗", 31],
    } as const;
    const [symbol, code] = styles[level];
    await this.output.write(`${this.paint(symbol, code)} ${fit(text, this.width - 2)}\n`);
  }
  async result(result: Result) {
    await this.message(
      result.success ? "success" : "error",
      result.message ?? (result.success ? "完了" : "失敗"),
    );
    if (result.data !== undefined)
      await this.output.write(`${fit(JSON.stringify(result.data), this.width)}\n`);
  }
  async blocks(blocks: Block[]) {
    for (const original of blocks) {
      const block = redacted(original);
      switch (block.kind) {
        case "message":
          await this.message(block.level, block.text);
          break;
        case "error":
          await this.message("error", `${block.code}: ${block.message}`);
          break;
        case "result":
          await this.result(block);
          break;
        case "progress":
          await this.message("info", `${block.label}  ${block.current} / ${block.total}`);
          break;
        case "key-value":
          for (const item of block.items)
            await this.output.write(`${fit(`${item.label}: ${String(item.value)}`, this.width)}\n`);
          break;
        case "table": {
          const columnWidth = Math.max(
            3,
            Math.floor((this.width - (block.columns.length - 1) * 2) / block.columns.length),
          );
          const rowText = (cells: string[]) =>
            fit(
              cells
                .map((cell) => {
                  const clipped = fit(cell, columnWidth);
                  return clipped + " ".repeat(Math.max(0, columnWidth - Bun.stringWidth(clipped)));
                })
                .join("  ")
                .trimEnd(),
              this.width,
            );
          await this.output.write(
            `${rowText(block.columns.map((column) => column.label))}\n${"─".repeat(this.width)}\n`,
          );
          for (const row of block.rows.slice(0, 20))
            await this.output.write(
              `${rowText(block.columns.map((column) => String(row[column.id])))}\n`,
            );
          if (block.rows.length > 20)
            await this.message(
              "info",
              `… ${block.rows.length - 20} 行省略（JSON 出力で全行を取得）`,
            );
          break;
        }
      }
    }
  }
}

/** At most one write and one latest state; no idle animation or queued frames. */
export class ProgressView {
  private latest: string | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: Promise<void> | undefined;
  private fault: unknown;
  constructor(
    private readonly display: Display,
    private readonly enabled: boolean,
    private readonly fail: (error: unknown) => void,
  ) {}
  update(text: string) {
    if (!this.enabled || this.fault) return;
    this.latest = text;
    if (!this.timer && !this.pending) this.timer = setTimeout(() => this.draw(), 100);
  }
  private draw() {
    this.timer = undefined;
    const text = this.latest;
    this.latest = undefined;
    if (text === undefined) return;
    this.pending = this.display.output
      .write(`\r\u001b[2K${fit(text, this.display.width)}`)
      .catch((error: unknown) => {
        this.fault = error;
        this.fail(error);
      })
      .finally(() => {
        this.pending = undefined;
        if (this.latest !== undefined && !this.fault)
          this.timer = setTimeout(() => this.draw(), 100);
      });
  }
  async clear() {
    this.latest = undefined;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    await this.pending;
    if (this.fault) throw this.fault;
    if (this.enabled) await this.display.output.write("\r\u001b[2K");
  }
  async close() {
    await this.clear();
  }
}
