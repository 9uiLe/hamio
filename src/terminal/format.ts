import type { Appearance } from "./appearance.ts";
import type { Block, Level, Result } from "../core/contract.ts";
import { visibleValue } from "../core/redaction.ts";
import type { Progress } from "../core/session.ts";
import { fit } from "./text.ts";

export function paint(text: string, code: number, enabled: boolean): string {
  return enabled ? `\u001b[${code}m${text}\u001b[0m` : text;
}
export function progressText(progress: Progress): string {
  const { first } = progress;
  const detail = first
    ? `${first.label}${first.total === undefined ? "" : ` ${first.current ?? 0}/${first.total}`}`
    : "処理の完了待ち";
  return `${detail}  │ 実行中 ${progress.active} · 完了 ${progress.succeeded} · 失敗 ${progress.failed}`;
}

/** Pure formatting: callers choose when and where each bounded line is written. */
export class Format {
  constructor(private readonly appearance: Appearance) {}
  message(level: Level, text: string): string {
    const styles = {
      info: ["●", 36],
      success: ["✓", 32],
      warning: ["▲", 33],
      error: ["✗", 31],
    } as const;
    const [symbol, color] = styles[level];
    return `${paint(symbol, color, this.appearance.color)} ${fit(text, this.appearance.width - 2)}\n`;
  }
  *result(result: Result): Generator<string> {
    yield this.message(
      result.success ? "success" : "error",
      result.message ?? (result.success ? "完了" : "失敗"),
    );
    if (result.data !== undefined)
      yield `${fit(JSON.stringify(result.data), this.appearance.width)}\n`;
  }
  *blocks(blocks: readonly Block[]): Generator<string> {
    const width = this.appearance.width;
    for (const block of blocks) {
      switch (block.kind) {
        case "message":
          yield this.message(block.level, block.text);
          break;
        case "error":
          yield this.message("error", `${block.code}: ${block.message}`);
          break;
        case "result":
          yield* this.result(block);
          break;
        case "progress":
          yield this.message("info", `${block.label}  ${block.current} / ${block.total}`);
          break;
        case "key-value":
          for (const item of block.items)
            yield `${fit(`${item.label}: ${String(visibleValue(item.value, item.secret))}`, width)}\n`;
          break;
        case "table": {
          const columnWidth = Math.max(
            3,
            Math.floor((width - (block.columns.length - 1) * 2) / block.columns.length),
          );
          const row = (cells: string[]) =>
            fit(
              cells
                .map((cell) => {
                  const clipped = fit(cell, columnWidth);
                  return clipped + " ".repeat(Math.max(0, columnWidth - Bun.stringWidth(clipped)));
                })
                .join("  ")
                .trimEnd(),
              width,
            );
          yield `${row(block.columns.map((column) => column.label))}\n${"─".repeat(width)}\n`;
          for (const values of block.rows.slice(0, 20))
            yield `${row(block.columns.map((column) => String(visibleValue(values[column.id] ?? null, column.secret))))}\n`;
          if (block.rows.length > 20)
            yield this.message(
              "info",
              `… ${block.rows.length - 20} 行省略（JSON 出力で全行を取得）`,
            );
          break;
        }
      }
    }
  }
}
