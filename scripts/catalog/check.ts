import { captureTerminal } from "../preview/capture.ts";
import { catalogResponse } from "./server.ts";
import { resolveScenario, scenarios } from "./scenarios.ts";
import { renderHtml } from "../../src/renderers/html.ts";
import { renderTerminal } from "../../src/renderers/terminal.ts";
import { checkCaptureArtifacts } from "./artifacts.ts";
import { verifyTerminalPaths } from "./terminal-verify.ts";

const requiredCoverage = [
  "task.pending",
  "task.running",
  "task.succeeded",
  "task.failed",
  "task.cancelled",
  "progress.none",
  "progress.indeterminate",
  "progress.zero",
  "progress.partial",
  "progress.complete",
  "message.info",
  "message.success",
  "message.warning",
  "message.error",
  "result.succeeded.none",
  "result.succeeded.value",
  "result.failed",
  "result.cancelled",
  "failure.details",
  "run.running",
  "run.succeeded",
  "run.failed",
  "run.cancelled",
  "run.empty",
  "run.group",
  "run.mixed",
  "run.independent",
  "table.small",
  "table.large",
  "table.truncated",
  "table.narrow",
  "table.long",
  "table.empty",
  "table.redacted",
  "code.normal",
  "code.empty",
  "diff.normal",
  "diff.truncated",
  "tree.nested",
  "tree.truncated",
  "keyvalue.normal",
  "keyvalue.empty",
  "keyvalue.redacted",
  "summary.normal",
  "content.long",
  "content.cjk",
] as const;

export async function checkCatalog(): Promise<void> {
  const ids = new Set<string>();
  const covered = new Set<string>();
  for (const scenario of scenarios) {
    if (!/^[a-z][a-z0-9-]*$/.test(scenario.id) || ids.has(scenario.id))
      throw new Error(`Scenario ID is invalid or duplicated: ${scenario.id}`);
    ids.add(scenario.id);
    if (!scenario.name || !scenario.description || !scenario.intent || !scenario.category)
      throw new Error(
        `Scenario ${scenario.id} needs a name, category, description, and inspection intent.`,
      );
    for (const name of scenario.covers) covered.add(name);
    const state = resolveScenario(scenario);
    for (const columns of [80, 40]) {
      try {
        const terminal = renderTerminal(state, { columns, color: false, animation: false });
        if (!terminal.includes("\n") || terminal.includes(String.fromCharCode(27)))
          throw new Error("Output is empty or contains a control sequence.");
        for (const line of terminal.trimEnd().split("\n"))
          if (Bun.stringWidth(line) >= columns)
            throw new Error(`Output exceeds the safe ${columns}-column line width.`);
      } catch (error) {
        throw new Error(
          `Scenario ${scenario.id}, Terminal ${columns} columns: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    }
    try {
      const html = renderHtml(state, { language: "en" });
      if (!html.startsWith("<!doctype html>") || !html.includes("<main>"))
        throw new Error("HTML document is incomplete.");
    } catch (error) {
      throw new Error(
        `Scenario ${scenario.id}, HTML renderer: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }
  for (const name of requiredCoverage)
    if (!covered.has(name)) throw new Error(`Catalog semantic inventory is missing: ${name}`);

  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: catalogResponse });
  try {
    for (const path of [
      "/?scenario=task-running-partial&terminal=narrow&html=narrow",
      "/html?scenario=task-running-partial",
    ]) {
      const response = await fetch(`http://127.0.0.1:${server.port}${path}`);
      if (!response.ok || !(await response.text()).includes("Compile sources"))
        throw new Error(`Catalog route failed: ${path} (${response.status}).`);
    }
  } finally {
    server.stop(true);
  }

  const captured = await captureTerminal({
    command: [
      process.execPath,
      "--no-env-file",
      "--no-install",
      "scripts/catalog/terminal-runner.ts",
      "task-running-partial",
      "40",
    ],
    cols: 40,
    rows: 24,
    steps: [{ waitFor: "Compile sources" }],
    holdMs: 0,
  });
  if (!captured.cast.includes("2/4")) throw new Error("Actual PTY output lost task progress.");
  await verifyTerminalPaths();
  await checkCaptureArtifacts();
  console.log(
    `Catalog: ${scenarios.length} shared scenarios, both renderers, HTTP routes, and representative PTY capture passed.`,
  );
}

if (import.meta.main) await checkCatalog();
