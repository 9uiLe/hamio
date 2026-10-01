import { PresentationSession } from "../../src/presentation/session.ts";
import { TerminalLiveView, terminalPolicy } from "../../src/renderers/terminal-live.ts";
import { renderTerminal } from "../../src/renderers/terminal.ts";
import { resolveScenario, scenarioById } from "./scenarios.ts";

const id = Bun.argv[2];
if (!id)
  throw new Error("Usage: bun scripts/catalog/terminal-runner.ts SCENARIO_ID COLUMNS [live]");
const columns = Number(Bun.argv[3]);
const scenario = scenarioById(id);
const policy = terminalPolicy({
  tty: Boolean(process.stdout.isTTY),
  columns: process.stdout.columns ?? columns,
  rows: process.stdout.rows,
  animation: process.env.HAMIO_CATALOG_ANIMATION !== "0",
  env: process.env,
});
if (Bun.argv[4] === "live") {
  if (scenario.source.kind !== "events") throw new Error(`Scenario ${id} has no Event sequence.`);
  const session = new PresentationSession();
  const view = new TerminalLiveView(process.stdout, policy);
  const resize = () => view.resize(process.stdout.columns ?? columns, process.stdout.rows);
  process.stdout.on("resize", resize);
  try {
    for (const event of scenario.source.events) {
      session.accept(event);
      view.update(session.snapshot());
      await Bun.sleep(300);
    }
    await view.close();
  } finally {
    process.stdout.off("resize", resize);
    await view.close();
  }
} else {
  process.stdout.write(
    renderTerminal(resolveScenario(scenario), {
      columns: policy.columns,
      color: policy.color,
      animation: false,
    }),
  );
}
