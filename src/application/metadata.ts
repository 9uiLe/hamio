import { version } from "../../package.json";
import { limits } from "../core/contract.ts";
import type { Command, Section } from "./command.ts";

export const VERSION = version;
export const help = `hamio ${VERSION} — terminal UI over JSON (API v1)

  hamio form --definition FILE [--values FILE|-] [--interactive auto|always|never]
  hamio render [--input FILE|-] [--format human|json]
  hamio stream [--format human|json] [--events]
  hamio capabilities [--section forms|display|stream|limits|all]
  hamio --version

--color auto|always|never is available for form, render and stream.
Human UI uses stderr; responses use stdout. See docs/api.md for the contract.
`;
export function capabilities(section: Section | undefined) {
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
  return section === "all" ? { ...base, ...details } : { ...base, [section]: details[section] };
}

export type Query = Extract<Command, { kind: "help" | "version" | "capabilities" }>;
export function queryResponse(command: Query): string {
  switch (command.kind) {
    case "help":
      return help;
    case "version":
      return `${VERSION}\n`;
    case "capabilities":
      return `${JSON.stringify(capabilities(command.section))}\n`;
  }
}
