import { readDocument, readEvents } from "./adapters/input.ts";
import { Output } from "./adapters/output.ts";
import { parseCommand } from "./application/command.ts";
import type { Ports } from "./application/ports.ts";
import { execute, reportFailure } from "./application/run.ts";
import { Cancelled } from "./core/contract.ts";

/** The process boundary: owns stdio, environment reads, signal listeners, and exit. */
export async function main(args: readonly string[]): Promise<number> {
  const { stdin, stdout, stderr, env } = process;
  const output = new Output(stdout);
  const screen = new Output(stderr);
  const controller = new AbortController();
  const cancel = () => controller.abort(new Cancelled());
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  const ports: Ports = {
    output,
    signal: controller.signal,
    readDocument: (path) => readDocument(path, stdin, controller.signal),
    readEvents: () => readEvents(stdin, controller.signal),
    async openView(appearance) {
      const { TerminalView } = await import("./adapters/terminal.ts");
      return new TerminalView(screen, appearance, (error) => controller.abort(error));
    },
    async ask(fields, title, appearance) {
      const { promptForm } = await import("./adapters/prompts.ts");
      return promptForm(fields, title, screen, stdin, stderr, controller.signal, appearance);
    },
  };
  try {
    const command = parseCommand(args, {
      inputTTY: !!stdin.isTTY,
      outputTTY: !!stderr.isTTY,
      columns: stderr.columns,
      term: env.TERM,
      ci: env.CI,
      noColor: env.NO_COLOR,
    });
    return await execute(command, ports);
  } catch (error) {
    return await reportFailure(error, output);
  } finally {
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
    stdin.pause();
    output.close();
    screen.close();
  }
}
if (import.meta.main) process.exit(await main(process.argv.slice(2)));
