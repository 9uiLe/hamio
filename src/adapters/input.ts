import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import { Cancelled, ContractError, limited, limits } from "../core/contract.ts";

async function* chunks(input: Readable, signal: AbortSignal) {
  const abort = () => input.destroy(new Cancelled());
  if (signal.aborted) throw signal.reason ?? new Cancelled();
  signal.addEventListener("abort", abort, { once: true });
  try {
    for await (const chunk of input) {
      if (signal.aborted) throw signal.reason ?? new Cancelled();
      if (!(chunk instanceof Uint8Array))
        throw new ContractError("IO_ERROR", "Input must be a byte stream.");
      yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
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

function decoder() {
  const utf8 = new TextDecoder("utf-8", { fatal: true });
  return (bytes: Uint8Array): string => {
    try {
      return utf8.decode(bytes);
    } catch {
      throw new ContractError("INVALID_JSON", "Input must be valid UTF-8.");
    }
  };
}

export async function readDocument(
  path: string,
  stdin: Readable,
  signal: AbortSignal,
): Promise<string> {
  const input = path === "-" ? stdin : createReadStream(path, { highWaterMark: 64 * 1024 });
  const parts: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of chunks(input, signal)) {
    size += chunk.byteLength;
    if (size > limits.documentBytes) limited("The input document exceeds its byte limit.");
    parts.push(chunk);
  }
  return decoder()(Buffer.concat(parts, size));
}

/** One batch per read: no promise or copy per complete frame; trailing frames stay lazy. */
export async function* readEvents(
  input: Readable,
  signal: AbortSignal,
): AsyncGenerator<Iterable<string>> {
  const decode = decoder();
  let parts: Uint8Array[] = [];
  let size = 0;
  function check(additional: number) {
    if (size + additional > limits.frameBytes) limited("An event exceeds its byte limit.");
  }
  function* split(chunk: Buffer): Generator<string> {
    let start = 0;
    for (let end = chunk.indexOf(10, start); end !== -1; end = chunk.indexOf(10, start)) {
      const part = chunk.subarray(start, end);
      check(part.length);
      let line: string;
      if (size === 0) line = decode(part);
      else {
        parts.push(part);
        line = decode(Buffer.concat(parts, size + part.length));
        parts = [];
        size = 0;
      }
      if (!line.trim())
        throw new ContractError("INVALID_JSON", "Empty event lines are not allowed.");
      yield line;
      start = end + 1;
    }
    if (start < chunk.length) {
      const remaining = chunk.subarray(start);
      check(remaining.length);
      size += remaining.length;
      // Only incomplete frames outlive this read; do not retain the entire buffer.
      parts.push(Buffer.from(remaining));
    }
  }
  for await (const chunk of chunks(input, signal)) yield split(chunk);
  if (size) yield [decode(Buffer.concat(parts, size))];
}
