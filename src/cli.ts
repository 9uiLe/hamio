import { Output } from "./adapters/output.ts";
import { parseCommand } from "./application/command.ts";
import { queryResponse } from "./application/metadata.ts";
import type { Ports } from "./application/ports.ts";
import { reportFailure } from "./application/response.ts";
import { Cancelled } from "./core/contract.ts";

/** Process boundary. Input and terminal execution are loaded only for commands that use them. */
export async function main(args: readonly string[]): Promise<number> {
  const { stdin, stdout, stderr, env } = process;
  const output = new Output(stdout);
  let screen: Output | undefined;
  const controller = new AbortController();
  const cancel = () => controller.abort(new Cancelled());
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    const command = parseCommand(args, {
      inputTTY: !!stdin.isTTY,
      outputTTY: !!stderr.isTTY,
      columns: stderr.columns,
      term: env.TERM,
      ci: env.CI,
      noColor: env.NO_COLOR,
    });
    if (command.kind === "help" || command.kind === "version" || command.kind === "capabilities") {
      await output.write(queryResponse(command));
      return 0;
    }
    const [{ execute }, { readDocument, readEvents }] = await Promise.all([
      import("./application/run.ts"),
      import("./adapters/input.ts"),
    ]);
    const destination = new Output(stderr);
    screen = destination;
    const ports: Ports = {
      output,
      signal: controller.signal,
      readDocument: (path) => readDocument(path, stdin, controller.signal),
      readEvents: () => readEvents(stdin, controller.signal),
      async openView(appearance) {
        const { TerminalView } = await import("./adapters/terminal.ts");
        return new TerminalView(destination, appearance, (error) => controller.abort(error));
      },
      async ask(fields, title, appearance) {
        const { promptForm } = await import("./adapters/prompts.ts");
        return promptForm(fields, title, destination, stdin, stderr, controller.signal, appearance);
      },
    };
    return await execute(command, ports);
  } catch (error) {
    return await reportFailure(error, output);
  } finally {
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
    stdin.pause();
    output.close();
    screen?.close();
  }
}
if (import.meta.main) process.exit(await main(process.argv.slice(2)));
