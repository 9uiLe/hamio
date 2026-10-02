import { Output } from "./adapters/output.ts";
import { Cancelled, OperationError } from "./application/error.ts";
import { help, VERSION } from "./application/metadata.ts";
import { reportFailure } from "./interaction/response.ts";

/** Process boundary. Interaction and Presentation internals are loaded only by their commands. */
export async function main(args: readonly string[]): Promise<number> {
  const { stdin, stdout, stderr, env } = process;
  const output = new Output(stdout);
  let screen: Output | undefined;
  const controller = new AbortController();
  const cancel = () => controller.abort(new Cancelled());
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    if (args[0] === "presentation") {
      const { executePresentation } = await import("./application/presentation-cli.ts");
      return await executePresentation(args.slice(1), {
        stdin,
        stdout,
        stderr,
        env,
        signal: controller.signal,
      });
    }
    if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
      await output.write(help);
      return 0;
    }
    if (args.length === 1 && args[0] === "--version") {
      await output.write(`${VERSION}\n`);
      return 0;
    }
    if (args[0] !== "form")
      throw new OperationError(
        "INVALID_ARGUMENT",
        "Choose presentation or form. Use --help for usage.",
      );
    const [{ parseFormCommand }, { executeForm }] = await Promise.all([
      import("./interaction/command.ts"),
      import("./interaction/application.ts"),
    ]);
    const command = parseFormCommand(args.slice(1), {
      inputTTY: !!stdin.isTTY,
      outputTTY: !!stderr.isTTY,
      columns: stderr.columns,
      term: env.TERM,
      ci: env.CI,
      noColor: env.NO_COLOR,
    });
    screen = new Output(stderr);
    return await executeForm(command, {
      output,
      screen,
      stdin,
      stderr,
      signal: controller.signal,
    });
  } catch (error) {
    if (args[0] === "presentation") {
      try {
        await output.write(
          `${JSON.stringify({ protocolVersion: 2, status: "error", error: { code: "RENDER_ERROR", message: "Could not start Presentation." } })}\n`,
        );
      } catch {
        return 7;
      }
      return 7;
    }
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
