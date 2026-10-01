import type { Readable, Writable } from "node:stream";
import { readDocument, readEvents } from "../adapters/input.ts";
import { Output } from "../adapters/output.ts";
import { Cancelled, ContractError } from "../core/contract.ts";
import { PresentationError } from "../presentation/error.ts";
import { stateLimits } from "../presentation/limits.ts";
import { PresentationSession } from "../presentation/session.ts";
import type { PresentationState } from "../presentation/model.ts";
import { decodeEventLine, decodeStatic } from "../protocol/decode.ts";
import { ProtocolError } from "../protocol/error.ts";
import { protocolLimits } from "../protocol/limits.ts";
import { TerminalLiveView, terminalPolicy } from "../renderers/terminal-live.ts";
import { renderTerminal } from "../renderers/terminal.ts";
import { VERSION } from "./metadata.ts";

interface CliPorts {
  stdin: Readable;
  stdout: Writable;
  stderr: Writable & { isTTY?: boolean; columns?: number; rows?: number };
  env: Readonly<Record<string, string | undefined>>;
  signal: AbortSignal;
}

type Command =
  | { kind: "help" }
  | { kind: "capabilities" }
  | { kind: "static"; input: string; noColor: boolean }
  | { kind: "live"; noColor: boolean; noMotion: boolean };

class CliError extends Error {
  constructor(
    readonly code: "INVALID_ARGUMENT" | "INCOMPLETE_STREAM" | "IO_ERROR",
    message: string,
  ) {
    super(message);
  }
}

const help = `hamio presentation — Presentation Protocol v2

  hamio presentation static [--input FILE|-] [--no-color]
  hamio presentation live [--no-color] [--no-motion]
  hamio presentation capabilities

Static reads one v2 JSON document; live reads v2 NDJSON from stdin.
Human presentation uses stderr; one machine response uses stdout.
Use docs/presentation-api.md for the wire contract and examples.
`;

function parse(args: readonly string[]): Command {
  const [kind, ...rest] = args;
  if ((kind === undefined || kind === "--help") && rest.length === 0) return { kind: "help" };
  if (kind === "capabilities" && rest.length === 0) return { kind };
  if (kind !== "static" && kind !== "live")
    throw new CliError("INVALID_ARGUMENT", "Choose static, live or capabilities.");
  let input = "-";
  let noColor = false;
  let noMotion = false;
  let inputSeen = false;
  for (let index = 0; index < rest.length; index++) {
    const option = rest[index];
    if (option === "--input" && kind === "static" && !inputSeen) {
      const path = rest[++index];
      if (!path || path.startsWith("--"))
        throw new CliError("INVALID_ARGUMENT", "--input requires a file path or -.");
      input = path;
      inputSeen = true;
    } else if (option === "--no-color" && !noColor) noColor = true;
    else if (option === "--no-motion" && kind === "live" && !noMotion) noMotion = true;
    else throw new CliError("INVALID_ARGUMENT", "An option is unknown or repeated.");
  }
  return kind === "static" ? { kind, input, noColor } : { kind, noColor, noMotion };
}

function runSummary(state: PresentationState) {
  return state.run.kind === "none"
    ? { runId: null, runState: null }
    : { runId: state.run.value.id, runState: state.run.value.state.kind };
}

function issue(error: unknown): { code: string; exit: number; message: string } {
  if (error instanceof Cancelled)
    return { code: "INTERRUPTED", exit: 130, message: "Presentation input was interrupted." };
  if (error instanceof CliError)
    return {
      code: error.code,
      exit: error.code === "INVALID_ARGUMENT" ? 2 : error.code === "INCOMPLETE_STREAM" ? 5 : 7,
      message: error.message,
    };
  if (error instanceof ProtocolError)
    return {
      code: error.code,
      exit: error.code === "LIMIT_EXCEEDED" ? 6 : 2,
      message: error.message,
    };
  if (error instanceof PresentationError)
    return {
      code: error.code,
      exit: error.code === "LIMIT_EXCEEDED" ? 6 : 5,
      message: error.message,
    };
  if (error instanceof ContractError)
    return {
      code:
        error.code === "LIMIT_EXCEEDED"
          ? "LIMIT_EXCEEDED"
          : error.code === "INVALID_JSON"
            ? "INVALID_UTF8"
            : "IO_ERROR",
      exit: error.code === "LIMIT_EXCEEDED" ? 6 : error.code === "INVALID_JSON" ? 2 : 7,
      message:
        error.code === "LIMIT_EXCEEDED"
          ? "Input byte limit exceeded."
          : error.code === "INVALID_JSON"
            ? "Input is not UTF-8."
            : "Could not read or write input.",
    };
  return { code: "RENDER_ERROR", exit: 7, message: "Could not present the accepted state." };
}

function policy(ports: CliPorts, noColor: boolean, animation: boolean) {
  return terminalPolicy({
    tty: !!ports.stderr.isTTY,
    columns: ports.stderr.columns ?? 80,
    ...(ports.stderr.rows === undefined ? {} : { rows: ports.stderr.rows }),
    animation,
    env: noColor ? { ...ports.env, NO_COLOR: "1" } : ports.env,
  });
}

export async function executePresentation(
  args: readonly string[],
  ports: CliPorts,
): Promise<number> {
  const machine = new Output(ports.stdout);
  const screen = new Output(ports.stderr);
  let view: TerminalLiveView | undefined;
  let lastAcceptedSeq: number | undefined;
  let lastRunId: string | undefined;
  let terminalFault: unknown;
  try {
    const command = parse(args);
    if (command.kind === "help") {
      await machine.write(help);
      return 0;
    }
    if (command.kind === "capabilities") {
      await machine.write(
        `${JSON.stringify({ protocolVersion: 2, version: VERSION, modes: ["static", "live"], renderer: "terminal", limits: { wire: protocolLimits, state: stateLimits } })}\n`,
      );
      return 0;
    }
    if (ports.signal.aborted) throw ports.signal.reason ?? new Cancelled();
    if (command.kind === "static") {
      const state = decodeStatic(await readDocument(command.input, ports.stdin, ports.signal));
      const config = policy(ports, command.noColor, false);
      await screen.write(
        renderTerminal(state, { columns: config.columns, color: config.color, animation: false }),
      );
      await machine.write(
        `${JSON.stringify({ protocolVersion: 2, status: "ok", ...runSummary(state) })}\n`,
      );
      return 0;
    }
    const session = new PresentationSession();
    const config = policy(ports, command.noColor, !command.noMotion);
    view = new TerminalLiveView(ports.stderr, config, ports.signal);
    const resize = () => view?.resize(ports.stderr.columns ?? 80, ports.stderr.rows);
    if (config.tty) ports.stderr.on("resize", resize);
    try {
      for await (const batch of readEvents(ports.stdin, ports.signal)) {
        let accepted = false;
        try {
          for (const line of batch) {
            if (ports.signal.aborted) throw ports.signal.reason ?? new Cancelled();
            const event = decodeEventLine(line);
            session.accept(event);
            lastAcceptedSeq = event.seq;
            lastRunId = event.runId;
            accepted = true;
          }
        } finally {
          if (accepted) view.update(session.snapshot());
        }
      }
      const state = session.snapshot();
      if (state.run.kind !== "present" || state.run.value.state.kind === "running")
        throw new CliError("INCOMPLETE_STREAM", "Input ended before run.finished.");
      await view.close();
      view = undefined;
      await machine.write(
        `${JSON.stringify({ protocolVersion: 2, status: "ok", ...runSummary(state), lastAcceptedSeq })}\n`,
      );
      return 0;
    } finally {
      ports.stderr.off("resize", resize);
    }
  } catch (error) {
    const failure = issue(error);
    try {
      await view?.close();
    } catch (closeError) {
      terminalFault = closeError;
    }
    const actual =
      terminalFault === undefined
        ? failure
        : issue(new CliError("IO_ERROR", "Could not write Terminal presentation."));
    try {
      await machine.write(
        `${JSON.stringify({ protocolVersion: 2, status: "error", error: { code: actual.code, message: actual.message }, ...(lastAcceptedSeq === undefined ? {} : { accepted: { runId: lastRunId, lastAcceptedSeq } }) })}\n`,
      );
    } catch {
      return 7;
    }
    return actual.exit;
  } finally {
    machine.close();
    screen.close();
  }
}
