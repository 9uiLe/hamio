import { BatchWriter } from "./batch.ts";
import { Cancelled, ContractError, type FormResponse } from "../core/contract.ts";
import { resolveForm } from "../core/form.ts";
import { redacted } from "../core/redaction.ts";
import { Session } from "../core/session.ts";
import { decodeDisplay, decodeEvent, decodeForm, decodeValues } from "../core/validation.ts";
import type { Command } from "./command.ts";
import { queryResponse } from "./metadata.ts";
import { json } from "./response.ts";
import type { Ports } from "./ports.ts";

async function form(command: Extract<Command, { kind: "form" }>, ports: Ports): Promise<number> {
  const definition = decodeForm(await ports.readDocument(command.definition));
  const supplied =
    command.values === undefined ? {} : decodeValues(await ports.readDocument(command.values));
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
      ? await ports.ask(resolved.missing, definition.title, command.appearance)
      : {};
    response = {
      ...base,
      status: "ok",
      id: definition.id,
      values: { ...resolved.values, ...answers },
    };
    code = 0;
  }
  await ports.output.write(json(response));
  return code;
}

async function stream(
  command: Extract<Command, { kind: "stream" }>,
  ports: Ports,
): Promise<number> {
  const session = new Session();
  const view = command.appearance ? await ports.openView(command.appearance) : undefined;
  const events = command.events ? new BatchWriter(ports.output) : undefined;
  const progress = () => session.snapshot();
  try {
    for await (const batch of ports.readEvents()) {
      for (const line of batch) {
        if (ports.signal.aborted) throw ports.signal.reason ?? new Cancelled();
        const event = decodeEvent(line);
        session.accept(event);
        const pending = events?.append(json({ apiVersion: 1, type: "event", event }));
        if (pending) await pending;
        switch (event.type) {
          case "run.start":
            if (view) await view.message("info", event.title);
            break;
          case "message":
            if (view) await view.message(event.level, event.text);
            break;
          case "run.finish":
            if (view) await view.result(event.result);
            await events?.flush();
            await ports.output.write(json(session.summary()));
            return 0;
          default:
            view?.progress(progress);
        }
      }
      await events?.flush();
    }
    throw new ContractError("PROTOCOL_ERROR", "Input ended before run.finish.");
  } finally {
    // Accepted events precede a later error response; cleanup runs even if delivery fails.
    try {
      await events?.flush();
    } finally {
      await view?.close();
    }
  }
}

export async function execute(command: Command, ports: Ports): Promise<number> {
  if (ports.signal.aborted) throw ports.signal.reason ?? new Cancelled();
  switch (command.kind) {
    case "help":
    case "version":
    case "capabilities":
      await ports.output.write(queryResponse(command));
      return 0;
    case "form":
      return form(command, ports);
    case "stream":
      return stream(command, ports);
    case "render": {
      const definition = decodeDisplay(await ports.readDocument(command.input));
      if (command.appearance) {
        const view = await ports.openView(command.appearance);
        try {
          await view.blocks(definition.blocks);
        } finally {
          await view.close();
        }
        await ports.output.write(json({ apiVersion: 1, status: "ok" }));
      } else
        await ports.output.write(
          json({ apiVersion: 1, status: "ok", blocks: definition.blocks.map(redacted) }),
        );
      return 0;
    }
  }
}
