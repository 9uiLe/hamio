import { OperationError } from "../application/error.ts";
import type { Appearance } from "./appearance.ts";

export interface FormEnvironment {
  readonly inputTTY: boolean;
  readonly outputTTY: boolean;
  readonly term: string | undefined;
  readonly ci: string | undefined;
  readonly noColor: string | undefined;
  readonly columns: number;
}

export interface FormCommand {
  readonly definition: string;
  readonly values: string | undefined;
  readonly interactive: boolean;
  readonly appearance: Appearance;
}

function choice<T extends string>(
  value: string | undefined,
  choices: readonly T[],
  fallback: T,
): T {
  if (value === undefined) return fallback;
  if (choices.some((candidate) => candidate === value)) return value as T;
  throw new OperationError("INVALID_ARGUMENT", "An option value is unsupported.");
}

export function parseFormCommand(
  args: readonly string[],
  environment: FormEnvironment,
): FormCommand {
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index++) {
    const option = args[index];
    if (!option?.startsWith("--"))
      throw new OperationError("INVALID_ARGUMENT", "Expected an option.");
    const key = option.slice(2);
    if (!["definition", "values", "interactive", "color"].includes(key) || options.has(key))
      throw new OperationError("INVALID_ARGUMENT", "An option is unknown or repeated.");
    const value = args[++index];
    if (!value || value.startsWith("--"))
      throw new OperationError("INVALID_ARGUMENT", "An option requires a value.");
    options.set(key, value);
  }
  const definition = options.get("definition");
  if (!definition || definition === "-")
    throw new OperationError("INVALID_ARGUMENT", "form requires a definition file.");
  const mode = choice(options.get("interactive"), ["auto", "always", "never"], "auto");
  const color = choice(options.get("color"), ["auto", "always", "never"], "auto");
  const capable = environment.term !== "dumb";
  const appearance: Appearance = {
    color:
      color === "always" ||
      (color === "auto" && environment.outputTTY && capable && !environment.noColor),
    width: Math.max(20, Math.min(environment.columns || 80, 240)),
    live: environment.outputTTY && capable,
  };
  const values = options.get("values");
  const terminal = environment.inputTTY && environment.outputTTY && capable && values !== "-";
  if (mode === "always" && !terminal)
    throw new OperationError(
      "INVALID_ARGUMENT",
      "Interactive input requires stdin and stderr terminals and a separate values file.",
    );
  return {
    definition,
    values,
    appearance,
    interactive: mode === "always" || (mode === "auto" && terminal && !environment.ci),
  };
}
