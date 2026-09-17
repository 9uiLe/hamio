import { Writable } from "node:stream";
import { finished } from "node:stream/promises";
import * as prompts from "@clack/prompts";
import {
  Cancelled,
  ContractError,
  type Field,
  type FormDefinition,
  type FormResponse,
  limits,
} from "./contract.ts";
import { Display, fit } from "./display.ts";
import { answerIssue, formResponse, resolveForm } from "./form.ts";
import type { Output } from "./io.ts";

class PromptOutput extends Writable {
  readonly isTTY = true;
  get columns() {
    return process.stderr.columns || 80;
  }
  get rows() {
    return process.stderr.rows || 24;
  }
  constructor(private readonly destination: Output) {
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
async function ask(field: Field, output: PromptOutput, signal: AbortSignal) {
  const common = {
    message: fit(field.label, output.columns - 6),
    input: process.stdin,
    output,
    signal,
  };
  const options =
    field.kind === "select" || field.kind === "multiselect"
      ? field.options.map((choice) => ({
          value: choice.value,
          label: fit(choice.label, output.columns - 8),
        }))
      : [];
  switch (field.kind) {
    case "text":
      return prompts.text({ ...common, validate: (value) => answerIssue(field, value)?.message });
    case "secret":
      return prompts.password({
        ...common,
        mask: "●",
        validate: (value) => answerIssue(field, value)?.message,
      });
    case "confirm":
      return prompts.confirm({
        ...common,
        initialValue: false,
        active: "はい",
        inactive: "いいえ",
      });
    case "select":
      return prompts.select({ ...common, options, maxItems: 8 });
    case "multiselect":
      return prompts.multiselect({ ...common, options, required: field.required, maxItems: 8 });
  }
}
export async function promptForm(
  form: FormDefinition,
  supplied: Record<string, unknown>,
  destination: Output,
  signal: AbortSignal,
  color: boolean,
): Promise<FormResponse> {
  const resolved = resolveForm(form, supplied);
  if (resolved.issues.length || !resolved.missing.length) return formResponse(form, supplied);
  const output = new PromptOutput(destination);
  const display = new Display(destination, color, output.columns);
  let outputFailed = false;
  let current: AbortController | undefined;
  const onOutputError = () => {
    outputFailed = true;
    current?.abort();
  };
  const onResize = () => output.emit("resize");
  output.on("error", onOutputError);
  process.stderr.on("resize", onResize);
  const raw = process.stdin.isRaw;
  try {
    if (form.title) await display.message("info", form.title);
    for (const field of resolved.missing) {
      if (signal.aborted) throw new Cancelled();
      if (field.description) await display.message("info", field.description);
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
      process.stdin.once("end", cancel);
      process.stdin.on("data", observe);
      try {
        const value = await ask(field, output, question.signal);
        await output.drain();
        if (outputFailed) throw new ContractError("IO_ERROR", "Could not write the prompt.");
        if (oversized)
          throw new ContractError("LIMIT_EXCEEDED", "Interactive input exceeded its byte limit.");
        if (prompts.isCancel(value) || signal.aborted) throw new Cancelled();
        resolved.values[field.id] = value;
      } finally {
        signal.removeEventListener("abort", cancel);
        process.stdin.off("end", cancel);
        process.stdin.off("data", observe);
        current = undefined;
      }
    }
    await display.message("success", "入力完了");
    return formResponse(form, resolved.values);
  } finally {
    process.stderr.off("resize", onResize);
    if (process.stdin.isTTY) process.stdin.setRawMode(raw ?? false);
    process.stdin.pause();
    output.end();
    await finished(output, { cleanup: true }).finally(() => output.off("error", onOutputError));
  }
}
