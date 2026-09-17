import type { Appearance } from "../terminal/appearance.ts";
import { ContractError } from "../core/contract.ts";

export interface Environment {
  readonly inputTTY: boolean;
  readonly outputTTY: boolean;
  readonly term: string | undefined;
  readonly ci: string | undefined;
  readonly noColor: string | undefined;
  readonly columns: number;
}
export type Section = "forms" | "display" | "stream" | "limits" | "all";
export type Command =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "capabilities"; section: Section | undefined }
  | {
      kind: "form";
      definition: string;
      values: string | undefined;
      interactive: boolean;
      appearance: Appearance;
    }
  | { kind: "render"; input: string; appearance: Appearance | undefined }
  | { kind: "stream"; events: boolean; appearance: Appearance | undefined };

const allowed = {
  form: ["definition", "values", "interactive", "color"],
  render: ["input", "format", "color"],
  stream: ["format", "color", "events"],
  capabilities: ["section"],
} as const;
function argument(message: string): never {
  throw new ContractError("INVALID_ARGUMENT", message);
}
function choice<T extends string>(
  value: string | undefined,
  choices: readonly T[],
  fallback: T,
): T {
  if (value === undefined) return fallback;
  for (const candidate of choices) if (candidate === value) return candidate;
  return argument("An option value is unsupported.");
}
export function parseCommand(args: readonly string[], environment: Environment): Command {
  if (args.length === 1) {
    if (args[0] === "--help" || args[0] === "-h") return { kind: "help" };
    if (args[0] === "--version") return { kind: "version" };
  }
  const [kind, ...rest] = args;
  if (kind !== "form" && kind !== "render" && kind !== "stream" && kind !== "capabilities")
    argument("Choose form, render, stream or capabilities. Use --help for usage.");
  const keys: readonly string[] = allowed[kind];
  const options = new Map<string, string>();
  for (let index = 0; index < rest.length; index++) {
    const option = rest[index];
    if (!option?.startsWith("--")) argument("Expected an option.");
    const key = option.slice(2);
    if (!keys.includes(key) || options.has(key)) argument("An option is unknown or repeated.");
    if (key === "events") options.set(key, "true");
    else {
      const value = rest[++index];
      if (!value || value.startsWith("--")) argument("An option requires a value.");
      options.set(key, value);
    }
  }
  if (kind === "capabilities") {
    const value = options.get("section");
    const section =
      value === undefined
        ? undefined
        : choice(value, ["forms", "display", "stream", "limits", "all"], "all");
    return { kind, section };
  }
  const color = choice(options.get("color"), ["auto", "always", "never"], "auto");
  const capable = environment.term !== "dumb";
  const appearance: Appearance = {
    color:
      color === "always" ||
      (color === "auto" && environment.outputTTY && capable && !environment.noColor),
    width: Math.max(20, Math.min(environment.columns || 80, 240)),
    live: environment.outputTTY && capable,
  };
  if (kind === "form") {
    const definition = options.get("definition");
    if (!definition || definition === "-") argument("form requires a definition file.");
    const mode = choice(options.get("interactive"), ["auto", "always", "never"], "auto");
    const values = options.get("values");
    const terminal = environment.inputTTY && environment.outputTTY && capable && values !== "-";
    if (mode === "always" && !terminal)
      argument("Interactive input requires stdin and stderr terminals and a separate values file.");
    return {
      kind,
      definition,
      values,
      appearance,
      interactive: mode === "always" || (mode === "auto" && terminal && !environment.ci),
    };
  }
  const format = choice(
    options.get("format"),
    ["human", "json"],
    environment.outputTTY ? "human" : "json",
  );
  const view = format === "human" ? appearance : undefined;
  if (kind === "render") return { kind, input: options.get("input") ?? "-", appearance: view };
  const events = options.has("events");
  if (events && view) argument("--events requires --format json.");
  return { kind, events, appearance: view };
}
