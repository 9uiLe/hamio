import type { ReadStream, WriteStream } from "node:tty";
import { readDocument } from "../adapters/input.ts";
import type { Writer } from "../adapters/output.ts";
import { Cancelled } from "../application/error.ts";
import { resolveForm } from "./form.ts";
import { decodeForm, decodeValues } from "./validate.ts";
import type { FormCommand } from "./command.ts";
import type { FormResponse } from "./contract.ts";
import { promptForm } from "./terminal.ts";

export async function executeForm(
  command: FormCommand,
  ports: {
    readonly output: Writer;
    readonly screen: Writer;
    readonly stdin: ReadStream;
    readonly stderr: WriteStream;
    readonly signal: AbortSignal;
  },
): Promise<number> {
  if (ports.signal.aborted) throw ports.signal.reason ?? new Cancelled();
  const definition = decodeForm(await readDocument(command.definition, ports.stdin, ports.signal));
  const supplied =
    command.values === undefined
      ? {}
      : decodeValues(await readDocument(command.values, ports.stdin, ports.signal));
  const resolved = resolveForm(definition, supplied);
  const base = { apiVersion: 1 } as const;
  let response: FormResponse;
  let code: number;
  if (resolved.status === "invalid_values") {
    response = { ...base, status: "invalid_values", id: definition.id, issues: resolved.issues };
    code = 4;
  } else if (resolved.missing.length && !command.interactive) {
    response = {
      ...base,
      status: "needs_input",
      id: definition.id,
      missing: resolved.missing.map((field) => field.id),
    };
    code = 3;
  } else {
    const answers = resolved.missing.length
      ? await promptForm(
          resolved.missing,
          definition.title,
          ports.screen,
          ports.stdin,
          ports.stderr,
          ports.signal,
          command.appearance,
        )
      : {};
    response = {
      ...base,
      status: "ok",
      id: definition.id,
      values: { ...resolved.values, ...answers },
    };
    code = 0;
  }
  await ports.output.write(`${JSON.stringify(response)}\n`);
  return code;
}
