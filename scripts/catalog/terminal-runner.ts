import { renderTerminalDiagnostic } from "../../src/renderers/terminal-diagnostic.ts";
import { resolveScenario, scenarioById } from "./scenarios.ts";

const id = Bun.argv[2];
if (!id) throw new Error("Usage: bun scripts/catalog/terminal-runner.ts SCENARIO_ID COLUMNS");
const columns = Number(Bun.argv[3]);
process.stdout.write(renderTerminalDiagnostic(resolveScenario(scenarioById(id)), columns));
