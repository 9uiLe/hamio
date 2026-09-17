import { Writable } from "node:stream";
import { finished } from "node:stream/promises";
import type { ReadStream, WriteStream } from "node:tty";
import {
  ConfirmPrompt,
  isCancel,
  MultiSelectPrompt,
  PasswordPrompt,
  SelectPrompt,
  TextPrompt,
} from "@clack/core";
import type { Appearance } from "../terminal/appearance.ts";
import type { Writer } from "../application/ports.ts";
import { type Answers, Cancelled, ContractError, type Field, limits } from "../core/contract.ts";
import { answerIssue } from "../core/form.ts";
import { Format } from "../terminal/format.ts";
import { inputLine, optionLines, promptFrame, type PromptState } from "../terminal/prompt-view.ts";

class PromptOutput extends Writable {
  readonly isTTY = true;
  get columns() {
    return this.terminal.columns || 80;
  }
  get rows() {
    return this.terminal.rows || 24;
  }
  constructor(
    private readonly destination: Writer,
    private readonly terminal: WriteStream,
  ) {
    super();
  }
  override write(
    chunk: string | Uint8Array,
    encoding?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void,
  ): boolean {
    const bytes = typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.byteLength;
    if (this.writableLength + bytes > limits.documentBytes) {
      const error = new ContractError(
        "LIMIT_EXCEEDED",
        "The prompt output queue exceeded its limit.",
      );
      this.destroy(error);
      (typeof encoding === "function" ? encoding : callback)?.(error);
      return false;
    }
    return typeof encoding === "function"
      ? super.write(chunk, encoding)
      : super.write(chunk, encoding ?? "utf8", callback);
  }
  override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ) {
    this.destination.write(chunk.toString("utf8")).then(
      () => callback(),
      () => callback(new ContractError("IO_ERROR", "Could not write the prompt.")),
    );
  }
  drain(): Promise<void> {
    return new Promise((resolve, reject) =>
      this.write("", (error?: Error | null) => (error ? reject(error) : resolve())),
    );
  }
}
async function ask(
  field: Field,
  output: PromptOutput,
  input: ReadStream,
  signal: AbortSignal,
  appearance: Appearance,
) {
  const common = {
    input,
    output,
    signal,
    validate: (value: unknown) => answerIssue(field, value)?.message,
  };
  const frame = (
    state: PromptState,
    lines: string[],
    answer: string,
    error: string,
    instruction?: string,
  ) =>
    promptFrame(
      { state, label: field.label, lines, answer, error, ...(instruction ? { instruction } : {}) },
      { ...appearance, width: Math.max(20, Math.min(output.columns, 240)) },
    );
  switch (field.kind) {
    case "text":
      return new TextPrompt({
        ...common,
        render() {
          return frame(
            this.state,
            [inputLine(this.userInput, this.cursor, output.columns - 2)],
            this.value ?? "",
            this.error,
            "Enter: 確定",
          );
        },
      }).prompt();
    case "secret":
      return new PasswordPrompt({
        ...common,
        mask: "●",
        render() {
          return frame(
            this.state,
            [inputLine(this.masked, this.cursor, output.columns - 2)],
            "[redacted]",
            this.error,
            "Enter: 確定",
          );
        },
      }).prompt();
    case "confirm":
      return new ConfirmPrompt({
        ...common,
        initialValue: false,
        active: "はい",
        inactive: "いいえ",
        render() {
          return frame(
            this.state,
            [this.value ? "● はい / ○ いいえ" : "○ はい / ● いいえ"],
            this.value ? "はい" : "いいえ",
            this.error,
            "←/→: 選択 · Enter: 確定",
          );
        },
      }).prompt();
    case "select":
      return new SelectPrompt({
        ...common,
        options: field.options,
        render() {
          return frame(
            this.state,
            optionLines(field.options, this.cursor, undefined, output.rows),
            field.options.find((option) => option.value === this.value)?.label ?? "",
            this.error,
            "↑/↓: 選択 · Enter: 確定",
          );
        },
      }).prompt();
    case "multiselect":
      return new MultiSelectPrompt({
        ...common,
        options: field.options,
        required: field.required,
        render() {
          return frame(
            this.state,
            optionLines(field.options, this.cursor, this.value ?? [], output.rows),
            field.options
              .filter((option) => this.value?.includes(option.value))
              .map((option) => option.label)
              .join(", "),
            this.error,
            "↑/↓: 移動 · Space: 選択 · Enter: 確定",
          );
        },
      }).prompt();
  }
}
export async function promptForm(
  fields: readonly Field[],
  title: string | undefined,
  destination: Writer,
  input: ReadStream,
  terminal: WriteStream,
  signal: AbortSignal,
  appearance: Appearance,
): Promise<Answers> {
  const answers: Answers = {};
  const output = new PromptOutput(destination, terminal);
  const format = new Format(appearance);
  let outputFailed = false;
  let current: AbortController | undefined;
  const onOutputError = () => {
    outputFailed = true;
    current?.abort();
  };
  const onResize = () => output.emit("resize");
  output.on("error", onOutputError);
  terminal.on("resize", onResize);
  const raw = input.isRaw;
  try {
    if (title) await destination.write(format.message("info", title));
    for (const field of fields) {
      if (signal.aborted) throw new Cancelled();
      if (field.description) await destination.write(format.message("info", field.description));
      const question = new AbortController();
      current = question;
      let inputBytes = 0;
      let oversized = false;
      const cancel = () => question.abort();
      const observe = (data: Buffer) => {
        inputBytes += data.length;
        if (inputBytes > limits.stringBytes * 4) {
          oversized = true;
          question.abort();
        }
        if (data.includes(4)) question.abort();
      };
      signal.addEventListener("abort", cancel, { once: true });
      input.once("end", cancel);
      input.on("data", observe);
      try {
        const value = await ask(field, output, input, question.signal, appearance);
        await output.drain();
        if (outputFailed) throw new ContractError("IO_ERROR", "Could not write the prompt.");
        if (oversized)
          throw new ContractError("LIMIT_EXCEEDED", "Interactive input exceeded its byte limit.");
        if (isCancel(value) || signal.aborted) throw new Cancelled();
        if (value === undefined || answerIssue(field, value))
          throw new ContractError("UI_ERROR", "The prompt returned an invalid answer.");
        answers[field.id] = value;
      } finally {
        signal.removeEventListener("abort", cancel);
        input.off("end", cancel);
        input.off("data", observe);
        current = undefined;
      }
    }
    await destination.write(format.message("success", "入力完了"));
    return answers;
  } finally {
    terminal.off("resize", onResize);
    if (input.isTTY) input.setRawMode(raw ?? false);
    input.pause();
    output.end();
    await finished(output, { cleanup: true }).finally(() => output.off("error", onOutputError));
  }
}
