import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface PreviewStep {
  waitFor: string;
  snapshot?: string;
  send?: string;
}

export interface CaptureOptions {
  command: string[];
  steps: readonly PreviewStep[];
  cols: number;
  rows: number;
  timeoutMs?: number;
  maxBytes?: number;
  holdMs?: number;
}

export async function captureTerminal(options: CaptureOptions) {
  const home = await mkdtemp(join(tmpdir(), "hamio-preview-"));
  const header = JSON.stringify({ version: 2, width: options.cols, height: options.rows });
  const events: string[] = [header];
  const snapshots = new Map<string, string>();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const started = performance.now();
  const finished = Promise.withResolvers<void>();
  let received = "";
  let bytes = 0;
  let fault: Error | undefined;
  let changed = Promise.withResolvers<void>();
  let closed = false;
  let child: ReturnType<typeof Bun.spawn> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function wake() {
    changed.resolve();
    changed = Promise.withResolvers<void>();
  }

  function fail(message: string) {
    fault ??= new Error(message);
    child?.kill("SIGKILL");
    finished.resolve();
    wake();
  }

  function append(text: string) {
    if (!text) return;
    received += text;
    const seconds = (performance.now() - started) / 1000;
    events.push(JSON.stringify([seconds, "o", text]));
  }

  try {
    child = Bun.spawn(options.command, {
      env: {
        PATH: process.env.PATH ?? "",
        HOME: home,
        TMPDIR: home,
        XDG_CONFIG_HOME: home,
        TERM: "xterm-256color",
        COLORTERM: "truecolor",
        LANG: "en_US.UTF-8",
        LC_ALL: "en_US.UTF-8",
        TZ: "UTC",
      },
      terminal: {
        cols: options.cols,
        rows: options.rows,
        data(_terminal, data) {
          if (fault) return;
          bytes += data.byteLength;
          if (bytes > (options.maxBytes ?? 1024 * 1024) || events.length >= 10_000) {
            fail("Preview output exceeded its limit.");
            return;
          }
          try {
            append(decoder.decode(data, { stream: true }));
          } catch {
            fail("Preview output is not valid UTF-8.");
          }
          wake();
        },
        exit(_terminal, status) {
          try {
            append(decoder.decode());
          } catch {
            fail("Preview output ended with invalid UTF-8.");
          }
          if (status !== 0) fail("Preview terminal closed with an error.");
          closed = true;
          finished.resolve();
          wake();
        },
      },
    });
    timer = setTimeout(() => fail("Preview timed out."), options.timeoutMs ?? 15_000);

    for (const step of options.steps) {
      while (!received.includes(step.waitFor)) {
        if (fault) throw fault;
        if (closed) throw new Error("Preview exited before reaching an expected screen.");
        await changed.promise;
      }
      if (fault) throw fault;
      received = received.slice(received.indexOf(step.waitFor) + step.waitFor.length);
      if (step.snapshot) snapshots.set(step.snapshot, `${events.join("\n")}\n`);
      if (step.send !== undefined) {
        await Bun.sleep(options.holdMs ?? 500);
        if (fault) throw fault;
        child.terminal?.write(step.send);
      }
    }

    await finished.promise;
    if (fault) throw fault;
    const exitCode = await child.exited;
    if (exitCode !== 0) throw new Error(`Preview command failed with exit code ${exitCode}.`);
    return { cast: `${events.join("\n")}\n`, snapshots, bytes };
  } finally {
    if (timer) clearTimeout(timer);
    if (child) {
      if (child.exitCode === null) child.kill("SIGKILL");
      await child.exited;
      child.terminal?.close();
    }
    await rm(home, { recursive: true, force: true });
  }
}
