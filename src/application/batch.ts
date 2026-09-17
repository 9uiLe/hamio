import type { Writer } from "./ports.ts";

/** Preserves whole records and bounds buffered bytes to the threshold plus one record. */
export class BatchWriter {
  private text = "";
  private bytes = 0;
  constructor(private readonly output: Writer) {}
  append(line: string): Promise<void> | undefined {
    this.text += line;
    this.bytes += Buffer.byteLength(line);
    if (this.bytes >= 16 * 1024) return this.flush();
    return undefined;
  }
  async flush(): Promise<void> {
    if (!this.text) return;
    const text = this.text;
    this.text = "";
    this.bytes = 0;
    await this.output.write(text);
  }
}
