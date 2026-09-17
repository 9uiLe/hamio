import type { Appearance } from "../application/command.ts";
import type { View, Writer } from "../application/ports.ts";
import type { Block, Level, Result } from "../core/contract.ts";
import type { Progress } from "../core/session.ts";
import { Format, progressText } from "../terminal/format.ts";
import { fit } from "../terminal/text.ts";

export async function writeLines(output: Writer, lines: Iterable<string>): Promise<void> {
  let text = "";
  let bytes = 0;
  for (const line of lines) {
    text += line;
    bytes += Buffer.byteLength(line);
    if (bytes >= 16 * 1024) {
      await output.write(text);
      text = "";
      bytes = 0;
    }
  }
  if (text) await output.write(text);
}

/** Owns one progress timer and one write. Formatting happens only at draw time. */
export class TerminalView implements View {
  private readonly format: Format;
  private latest: (() => Progress) | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: Promise<void> | undefined;
  private fault: unknown;
  private drawn = false;
  private closed = false;

  constructor(
    private readonly output: Writer,
    private readonly appearance: Appearance,
    private readonly abort: (error: unknown) => void,
  ) {
    this.format = new Format(appearance);
  }
  progress(read: () => Progress): void {
    if (!this.appearance.live || this.closed || this.fault) return;
    this.latest = read;
    this.schedule();
  }
  private schedule(): void {
    if (!this.timer && !this.pending && this.latest && !this.closed && !this.fault)
      this.timer = setTimeout(() => this.draw(), 100);
  }
  private draw(): void {
    this.timer = undefined;
    const read = this.latest;
    this.latest = undefined;
    if (!read || this.closed) return;
    this.pending = this.writeProgress(read)
      .catch((error: unknown) => {
        this.fault = error;
        this.abort(error);
      })
      .finally(() => {
        this.pending = undefined;
        this.schedule();
      });
  }
  private async writeProgress(read: () => Progress): Promise<void> {
    const text = fit(progressText(read()), this.appearance.width);
    this.drawn = true;
    await this.output.write(`\r\u001b[2K${text}`);
  }
  private async clear(): Promise<void> {
    this.latest = undefined;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    await this.pending;
    if (this.fault) throw this.fault;
    if (this.drawn) {
      this.drawn = false;
      await this.output.write("\r\u001b[2K");
    }
  }
  async message(level: Level, text: string): Promise<void> {
    await this.clear();
    await this.output.write(this.format.message(level, text));
  }
  async blocks(blocks: readonly Block[]): Promise<void> {
    await this.clear();
    await writeLines(this.output, this.format.blocks(blocks));
  }
  async result(result: Result): Promise<void> {
    await this.clear();
    await writeLines(this.output, this.format.result(result));
  }
  async close(): Promise<void> {
    this.closed = true;
    await this.clear();
  }
}
