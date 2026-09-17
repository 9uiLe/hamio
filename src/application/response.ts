import { Cancelled, ContractError } from "../core/contract.ts";
import type { Writer } from "./ports.ts";

export const json = (value: unknown) => `${JSON.stringify(value)}\n`;

/** Converts internal failure into the public response without exposing input or stack. */
export async function reportFailure(error: unknown, output: Writer): Promise<number> {
  const cancelled = error instanceof Cancelled;
  const failure =
    error instanceof ContractError
      ? error
      : new ContractError("UI_ERROR", "The UI could not complete the request.");
  try {
    await output.write(
      json(
        cancelled
          ? { apiVersion: 1, status: "cancelled" }
          : {
              apiVersion: 1,
              status: "error",
              error: { code: failure.code, message: failure.message },
            },
      ),
    );
  } catch {
    return 7;
  }
  return cancelled ? 130 : failure.exitCode;
}
