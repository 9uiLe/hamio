import type { Writable } from "node:stream";
import type { PresentationState } from "../presentation/model.ts";
import { terminalFrame, type TerminalRenderOptions } from "./terminal.ts";

export interface TerminalPolicy {
  tty: boolean;
  columns: number;
  rows?: number;
  color: boolean;
  animation: boolean;
}

export function terminalPolicy(input: {
  tty: boolean;
  columns: number;
  rows?: number;
  animation: boolean;
  env: Readonly<Record<string, string | undefined>>;
}): TerminalPolicy {
  const tty = input.tty && input.env.TERM !== "dumb";
  return {
    tty,
    columns:
      Number.isSafeInteger(input.columns) && input.columns >= 20 && input.columns <= 500
        ? input.columns
        : 80,
    ...(input.rows === undefined || !Number.isSafeInteger(input.rows) || input.rows < 2
      ? {}
      : { rows: input.rows }),
    color: tty && !input.env.NO_COLOR,
    animation: tty && input.animation,
  };
}

function write(output: Writable, chunk: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        // Writable may emit its error after invoking the write callback.
        setTimeout(() => output.off("error", onError), 0);
        reject(error);
      } else {
        output.off("error", onError);
        resolve();
      }
    };
    const onError = (error: Error) => finish(error);
    // A stalled destination must not keep close(), signal handling, or a CLI response pending forever.
    const timer = setTimeout(() => finish(new Error("Terminal output timed out.")), 5000);
    output.once("error", onError);
    try {
      output.write(chunk, finish);
    } catch (error) {
      finish(error instanceof Error ? error : new Error("Terminal output failed."));
    }
  });
}

export class TerminalLiveView {
  private latest: PresentationState | undefined;
  private previous: string[] = [];
  private previousPlain: string[] = [];
  private appendOnly = false;
  private policy: TerminalPolicy;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private timerDue = Number.POSITIVE_INFINITY;
  private pending = false;
  private writing: Promise<void> | undefined;
  private lastPaint = Number.NEGATIVE_INFINITY;
  private lastSpin = Number.NEGATIVE_INFINITY;
  private spinnerFrame = 0;
  private resetOnResize = false;
  private closing = false;
  private closed = false;
  private failure: Error | undefined;
  private readonly abort = () => {
    void this.close().catch(() => {});
  };

  constructor(
    private readonly output: Writable,
    policy: TerminalPolicy,
    private readonly signal?: AbortSignal,
  ) {
    this.policy = { ...policy };
    signal?.addEventListener("abort", this.abort, { once: true });
    if (signal?.aborted) this.abort();
  }

  update(state: PresentationState): void {
    if (this.closing || this.closed) throw new Error("Terminal view is closed.");
    this.latest = structuredClone(state);
    this.pending = true;
    this.schedule(Math.max(performance.now(), this.lastPaint + 100));
  }

  resize(columns: number, rows?: number): void {
    if (this.closing || this.closed) return;
    if (!Number.isSafeInteger(columns) || columns < 20 || columns > 500) return;
    if (columns === this.policy.columns && (rows === undefined || rows === this.policy.rows))
      return;
    this.policy.columns = columns;
    if (rows !== undefined) this.policy.rows = rows;
    this.resetOnResize = true;
    this.pending = true;
    this.schedule(Math.max(performance.now(), this.lastPaint + 100));
  }

  async close(): Promise<void> {
    if (this.closed) {
      if (this.failure) throw this.failure;
      return;
    }
    this.closing = true;
    this.clearTimer();
    await this.writing;
    if (this.failure) throw this.failure;
    if (this.pending && this.latest) await this.paint(true);
    this.closed = true;
    this.signal?.removeEventListener("abort", this.abort);
  }

  private clearTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.timerDue = Number.POSITIVE_INFINITY;
  }

  private schedule(due: number): void {
    if (this.closing || this.closed || !this.latest || this.writing) return;
    if (this.timer !== undefined && this.timerDue <= due) return;
    this.clearTimer();
    this.timerDue = due;
    this.timer = setTimeout(
      () => {
        this.clearTimer();
        void this.paint(false).catch((error) => {
          this.failure = error instanceof Error ? error : new Error(String(error));
          this.clearTimer();
          this.closed = true;
          this.signal?.removeEventListener("abort", this.abort);
        });
      },
      Math.max(0, due - performance.now()),
    );
  }

  private async paint(force: boolean): Promise<void> {
    if (!this.latest || this.writing || this.closed) return;
    const now = performance.now();
    if (!force && now < this.lastPaint + 100) {
      this.schedule(this.lastPaint + 100);
      return;
    }
    const state = this.latest;
    const policy = { ...this.policy };
    const active = state.run.kind === "present" && state.run.value.state.kind === "running";
    let animate = policy.tty && policy.animation && active && !this.appendOnly;
    const spin = animate && now >= this.lastSpin + 250;
    if (spin) this.spinnerFrame++;
    const options: TerminalRenderOptions = {
      columns: policy.columns,
      color: policy.color,
      animation: animate,
      spinnerFrame: this.spinnerFrame,
    };
    let frame = terminalFrame(state, options);
    let lines = frame.styled;
    let plain = frame.plain;
    if (policy.tty && lines.length >= Math.max(2, (policy.rows ?? 24) - 1)) {
      // Cursor-up cannot safely address lines that have scrolled beyond the viewport.
      this.appendOnly = true;
      animate = false;
      options.animation = false;
      frame = terminalFrame(state, options);
      lines = frame.styled;
      plain = frame.plain;
    }
    let chunk = "";
    if (policy.tty && !this.appendOnly) {
      if (this.previous.length === 0 || this.resetOnResize) {
        // Terminal reflow after resize makes the old physical row count unreliable.
        chunk = this.previous.length === 0 ? `${lines.join("\n")}\n` : `\r\n${lines.join("\n")}\n`;
      } else {
        const shared = Math.min(lines.length, this.previous.length);
        for (let index = 0; index < shared; index++) {
          if (lines[index] !== this.previous[index]) {
            const distance = this.previous.length - index;
            chunk += `\r\u001b[${distance}A\u001b[2K${lines[index]}\r\u001b[${distance}B`;
          }
        }
        if (lines.length > this.previous.length)
          chunk += `${lines.slice(this.previous.length).join("\n")}\n`;
        else if (lines.length < this.previous.length) {
          for (let index = lines.length; index < this.previous.length; index++) {
            const distance = this.previous.length - index;
            chunk += `\r\u001b[${distance}A\u001b[2K\r\u001b[${distance}B`;
          }
          chunk += `\r\u001b[${this.previous.length - lines.length}A`;
        }
      }
      this.resetOnResize = false;
      if (chunk) this.previous = lines;
    } else {
      // A pipe receives changed semantic lines, never cursor controls or repeated full frames.
      const changed = lines.filter((_, index) => plain[index] !== this.previousPlain[index]);
      chunk = changed.length ? `${changed.join("\n")}\n` : "";
      this.previous = plain;
    }
    this.previousPlain = plain;
    this.pending = false;
    if (chunk) {
      this.writing = write(this.output, chunk);
      try {
        await this.writing;
      } catch (error) {
        this.failure = error instanceof Error ? error : new Error(String(error));
        this.clearTimer();
        this.closed = true;
        this.signal?.removeEventListener("abort", this.abort);
        throw this.failure;
      } finally {
        this.writing = undefined;
      }
    }
    this.lastPaint = performance.now();
    if (spin) this.lastSpin = this.lastPaint;
    if (!this.closing && !this.closed) {
      if (this.pending) this.schedule(this.lastPaint + 100);
      else if (animate) this.schedule(Math.max(this.lastPaint + 100, this.lastSpin + 250));
    }
  }
}
