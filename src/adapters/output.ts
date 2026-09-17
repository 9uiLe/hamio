import type { Writable } from "node:stream";
import type { Writer } from "../application/ports.ts";
import { ContractError, limits } from "../core/contract.ts";

/** Owns the error listener and deadline for one destination. Call close after all writes. */
export class Output implements Writer {
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
      try {
        this.stream.write(text, (error) => {
          clearTimeout(timer);
          if (error) {
            this.fault = true;
            reject(new ContractError("IO_ERROR", "Could not write output."));
          } else resolve();
        });
      } catch {
        clearTimeout(timer);
        this.fault = true;
        reject(new ContractError("IO_ERROR", "Could not write output."));
      }
    });
  }
  close() {
    this.stream.off("error", this.onError);
  }
}
