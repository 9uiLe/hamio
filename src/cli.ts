import { Cancelled, ContractError, limits, VERSION } from "./contract.ts";
import { formResponse } from "./form.ts";
import { Output, readDocument, readEvents } from "./io.ts";
import { Session } from "./session.ts";
import { displayDefinition, eventDefinition, formDefinition, record } from "./validation.ts";

const help = `hamio ${VERSION} — terminal UI over JSON (API v1)

  hamio form --definition FILE [--values FILE|-] [--interactive auto|always|never]
  hamio render [--input FILE|-] [--format human|json]
  hamio stream [--format human|json] [--events]
  hamio capabilities [--section forms|display|stream|limits|all]
  hamio --version

--color auto|always|never is available for form, render and stream.
Human UI uses stderr; responses use stdout. See docs/api.md for the contract.
`;
type Command = "form" | "render" | "stream" | "capabilities";
function argumentsFor(args: string[]) {
  const [command, ...rest] = args;
  if (
    command !== "form" &&
    command !== "render" &&
    command !== "stream" &&
    command !== "capabilities"
  )
    throw new ContractError(
      "INVALID_ARGUMENT",
      "Choose form, render, stream or capabilities. Use --help for usage.",
    );
  const allowed: Record<Command, string[]> = {
    form: ["definition", "values", "interactive", "color"],
    render: ["input", "format", "color"],
    stream: ["format", "color", "events"],
    capabilities: ["section"],
  };
  const options = new Map<string, string>();
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg?.startsWith("--")) throw new ContractError("INVALID_ARGUMENT", "Expected an option.");
    const key = arg.slice(2);
    if (!allowed[command].includes(key) || options.has(key))
      throw new ContractError("INVALID_ARGUMENT", "An option is unknown or repeated.");
    if (key === "events") {
      options.set(key, "true");
      continue;
    }
    const value = rest[++i];
    if (!value || value.startsWith("--"))
      throw new ContractError("INVALID_ARGUMENT", "An option requires a value.");
    options.set(key, value);
  }
  return { command, options };
}
function choice(value: string | undefined, choices: readonly string[], fallback: string) {
  const selected = value ?? fallback;
  if (!choices.includes(selected))
    throw new ContractError("INVALID_ARGUMENT", "An option value is unsupported.");
  return selected;
}
function capabilities(section?: string) {
  const base = {
    apiVersion: 1,
    version: VERSION,
    commands: ["form", "render", "stream", "capabilities"],
  };
  const details = {
    forms: ["text", "confirm", "select", "multiselect", "secret"],
    display: ["message", "key-value", "table", "progress", "result", "error"],
    stream: ["run.start", "task.start", "task.progress", "task.finish", "message", "run.finish"],
    limits,
  };
  if (section === undefined) return base;
  if (section === "all") return { ...base, ...details };
  if (section === "forms" || section === "display" || section === "stream" || section === "limits")
    return { ...base, [section]: details[section] };
  throw new ContractError("INVALID_ARGUMENT", "An unknown capability section was requested.");
}

async function execute(
  args: string[],
  stdout: Output,
  stderr: Output,
  controller: AbortController,
) {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    await stdout.write(help);
    return 0;
  }
  if (args.length === 1 && args[0] === "--version") {
    await stdout.write(`${VERSION}\n`);
    return 0;
  }
  const { command, options } = argumentsFor(args);
  if (command === "capabilities") {
    await stdout.json(capabilities(options.get("section")));
    return 0;
  }
  const { signal } = controller;
  const colorOption = choice(options.get("color"), ["auto", "always", "never"], "auto");
  const color =
    colorOption === "always" ||
    (colorOption === "auto" &&
      !!process.stderr.isTTY &&
      process.env.TERM !== "dumb" &&
      !process.env.NO_COLOR);
  // Clack uses Node styleText; set its policy before loading the UI adapter.
  process.env.FORCE_COLOR = color ? "1" : "0";
  if (color) delete process.env.NO_COLOR;
  if (command === "form") {
    const path = options.get("definition");
    if (!path || path === "-")
      throw new ContractError("INVALID_ARGUMENT", "form requires a definition file.");
    const mode = choice(options.get("interactive"), ["auto", "always", "never"], "auto");
    const valuesPath = options.get("values");
    const terminal = !!process.stdin.isTTY && !!process.stderr.isTTY && process.env.TERM !== "dumb";
    if (mode === "always" && (!terminal || valuesPath === "-"))
      throw new ContractError(
        "INVALID_ARGUMENT",
        "Interactive input requires stdin and stderr terminals and a separate values file.",
      );
    const form = formDefinition(await readDocument(path, signal));
    const values = valuesPath ? record(await readDocument(valuesPath, signal)) : {};
    const interactive =
      mode === "always" || (mode === "auto" && terminal && !process.env.CI && valuesPath !== "-");
    const response = interactive
      ? await (await import("./prompts.ts")).promptForm(form, values, stderr, signal, color)
      : formResponse(form, values);
    await stdout.json(response);
    return response.status === "ok"
      ? 0
      : response.status === "needs_input"
        ? 3
        : response.status === "invalid_values"
          ? 4
          : 130;
  }
  const format = choice(
    options.get("format"),
    ["human", "json"],
    process.stderr.isTTY ? "human" : "json",
  );
  const human = format === "human";
  const display = human
    ? new (await import("./display.ts")).Display(
        stderr,
        color,
        Math.max(20, Math.min(process.stderr.columns || 80, 240)),
      )
    : undefined;
  if (command === "render") {
    const input = displayDefinition(await readDocument(options.get("input") ?? "-", signal));
    const { redacted } = await import("./display.ts");
    if (display) {
      await display.blocks(input.blocks);
      await stdout.json({ apiVersion: 1, status: "ok" });
    } else await stdout.json({ apiVersion: 1, status: "ok", blocks: input.blocks.map(redacted) });
    return 0;
  }
  const events = options.has("events");
  if (events && human)
    throw new ContractError("INVALID_ARGUMENT", "--events requires --format json.");
  const session = new Session();
  const progress = display
    ? new (await import("./display.ts")).ProgressView(
        display,
        !!process.stderr.isTTY && process.env.TERM !== "dumb",
        (error) => controller.abort(error),
      )
    : undefined;
  try {
    for await (const value of readEvents(process.stdin, signal)) {
      const event = eventDefinition(value);
      session.accept(event);
      if (events) await stdout.json({ apiVersion: 1, type: "event", event });
      if (event.type === "run.start" || event.type === "message") {
        await progress?.clear();
        if (display)
          await display.message(
            event.type === "run.start" ? "info" : event.level,
            event.type === "run.start" ? event.title : event.text,
          );
      } else if (event.type === "run.finish") {
        await progress?.clear();
        if (display) await display.result(event.result);
        await stdout.json(session.summary(event.result));
        return 0;
      } else progress?.update(session.progressText());
    }
    throw new ContractError("PROTOCOL_ERROR", "Input ended before run.finish.");
  } finally {
    await progress?.close();
  }
}

export async function main(args: string[]): Promise<number> {
  const stdout = new Output(process.stdout);
  const stderr = new Output(process.stderr);
  const controller = new AbortController();
  const cancel = () => controller.abort(new Cancelled());
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    return await execute(args, stdout, stderr, controller);
  } catch (error) {
    const cancelled = error instanceof Cancelled;
    const failure =
      error instanceof ContractError
        ? error
        : new ContractError("UI_ERROR", "The UI could not complete the request.");
    try {
      await stdout.json(
        cancelled
          ? { apiVersion: 1, status: "cancelled" }
          : {
              apiVersion: 1,
              status: "error",
              error: { code: failure.code, message: failure.message },
            },
      );
    } catch {
      return 7;
    }
    return cancelled ? 130 : failure.exitCode;
  } finally {
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
    process.stdin.pause();
    stdout.close();
    stderr.close();
  }
}
if (import.meta.main) process.exit(await main(process.argv.slice(2)));
