import { createReadStream } from "node:fs";
import type { Readable, Writable } from "node:stream";
import { Cancelled, ContractError, limited, limits } from "./contract.ts";
import { parseJson } from "./validation.ts";

async function* chunks(input: Readable, signal: AbortSignal) {
  const abort = () => input.destroy(new Cancelled());
  if (signal.aborted) throw new Cancelled();
  signal.addEventListener("abort", abort, { once: true });
  try {
    for await (const chunk of input) {
      if (signal.aborted) throw new Cancelled();
      if (!(chunk instanceof Uint8Array))
        throw new ContractError("IO_ERROR", "Input must be a byte stream.");
      yield chunk;
    }
  } catch (error) {
    if (signal.aborted)
      throw signal.reason instanceof ContractError ? signal.reason : new Cancelled();
    if (error instanceof ContractError) throw error;
    throw new ContractError("IO_ERROR", "Could not read input.");
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ContractError("INVALID_JSON", "Input must be valid UTF-8.");
  }
}
export async function readDocument(path: string, signal: AbortSignal) {
  const input = path === "-" ? process.stdin : createReadStream(path, { highWaterMark: 64 * 1024 });
  const parts: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of chunks(input, signal)) {
    size += chunk.byteLength;
    if (size > limits.documentBytes) limited("The input document exceeds its byte limit.");
    parts.push(chunk);
  }
  return parseJson(decode(Buffer.concat(parts, size)));
}
export async function* readEvents(input: Readable, signal: AbortSignal) {
  let parts: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of chunks(input, signal)) {
    let start = 0;
    for (let index = 0; index < chunk.length; index++) {
      if (chunk[index] !== 10) continue;
      const part = chunk.subarray(start, index);
      size += part.length;
      if (size > limits.frameBytes) limited("An event exceeds its byte limit.");
      parts.push(part);
      const line = decode(Buffer.concat(parts, size));
      if (!line.trim())
        throw new ContractError("INVALID_JSON", "Empty event lines are not allowed.");
      yield parseJson(line);
      parts = [];
      size = 0;
      start = index + 1;
    }
    if (start < chunk.length) {
      const remaining = chunk.subarray(start);
      size += remaining.length;
      if (size > limits.frameBytes) limited("An event exceeds its byte limit.");
      // Do not retain the backing buffer of an already consumed chunk.
      parts.push(Buffer.from(remaining));
    }
  }
  if (size) yield parseJson(decode(Buffer.concat(parts, size)));
}

export class Output {
  private fault = false;
  private readonly onError = () => {
    this.fault = true;
  };
  constructor(
    private readonly stream: Writable,
    private readonly timeoutMs: number = limits.outputTimeoutMs,
  ) {
    stream.on("error", this.onError);
  }
  async write(text: string): Promise<void> {
    if (this.fault || this.stream.destroyed)
      throw new ContractError("IO_ERROR", "Could not write output.");
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fault = true;
        reject(new ContractError("IO_ERROR", "Output did not accept data before its deadline."));
      }, this.timeoutMs);
      this.stream.write(text, (error) => {
        clearTimeout(timer);
        if (error) reject(new ContractError("IO_ERROR", "Could not write output."));
        else resolve();
      });
    });
  }
  json(value: unknown) {
    return this.write(`${JSON.stringify(value)}\n`);
  }
  close() {
    this.stream.off("error", this.onError);
  }
}
