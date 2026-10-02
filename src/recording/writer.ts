import { open, type FileHandle } from "node:fs/promises";
import type { PresentationEvent } from "../presentation/model.ts";
import { encodeEvent } from "../protocol/encode.ts";
import { protocolLimits } from "../protocol/limits.ts";
import { headerLine, recordingLimits, trailerLine } from "./format.ts";

export class RecordingWriteError extends Error {
  constructor(readonly code: "IO_ERROR" | "LIMIT_EXCEEDED" | "INVALID_ARGUMENT") {
    super(
      code === "LIMIT_EXCEEDED"
        ? "Recording limit exceeded."
        : code === "INVALID_ARGUMENT"
          ? "Recording file already exists."
          : "Could not write recording.",
    );
  }
}

export class RecordingWriter {
  private bytes = 0;
  private count = 0;
  private last: number | null = null;
  private finished = false;
  private closed = false;

  private constructor(private readonly file: FileHandle) {}

  static async create(path: string): Promise<RecordingWriter> {
    let file: FileHandle;
    try {
      file = await open(path, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        throw new RecordingWriteError("INVALID_ARGUMENT");
      throw new RecordingWriteError("IO_ERROR");
    }
    const writer = new RecordingWriter(file);
    try {
      await writer.write(headerLine);
      return writer;
    } catch (error) {
      await writer.abort();
      throw error;
    }
  }

  get eventCount(): number {
    return this.count;
  }
  get lastRecordedSeq(): number | null {
    return this.last;
  }

  async append(event: PresentationEvent): Promise<void> {
    if (this.count >= recordingLimits.events) throw new RecordingWriteError("LIMIT_EXCEEDED");
    const line = `${encodeEvent(event)}\n`;
    if (Buffer.byteLength(line) - 1 > protocolLimits.frameBytes)
      throw new RecordingWriteError("LIMIT_EXCEEDED");
    await this.write(line);
    this.count++;
    this.last = event.seq;
    this.finished = event.type === "run.finished";
  }

  async finish(status: "complete" | "partial"): Promise<void> {
    if (this.closed) return;
    if (status === "complete" && !this.finished) throw new RecordingWriteError("IO_ERROR");
    try {
      await this.write(trailerLine(status, this.count, this.last));
      await this.file.sync();
      await this.file.close();
      this.closed = true;
    } catch {
      await this.abort();
      throw new RecordingWriteError("IO_ERROR");
    }
  }

  async abort(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.file.close();
    } catch {
      /* The original write failure remains authoritative. */
    }
  }

  private async write(line: string): Promise<void> {
    const buffer = Buffer.from(line);
    if (this.bytes + buffer.byteLength > recordingLimits.bytes)
      throw new RecordingWriteError("LIMIT_EXCEEDED");
    try {
      let offset = 0;
      while (offset < buffer.byteLength) {
        const { bytesWritten } = await this.file.write(
          buffer,
          offset,
          buffer.byteLength - offset,
          null,
        );
        if (bytesWritten === 0) throw new Error("No write progress.");
        offset += bytesWritten;
      }
      this.bytes += buffer.byteLength;
    } catch {
      throw new RecordingWriteError("IO_ERROR");
    }
  }
}
