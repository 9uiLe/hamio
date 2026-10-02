import { captureTerminal } from "../terminal-capture/capture.ts";

function output(cast: string): string {
  return cast
    .trimEnd()
    .split("\n")
    .slice(1)
    .map((line) => JSON.parse(line) as [number, string, string])
    .filter((event) => event[1] === "o")
    .map((event) => event[2])
    .join("");
}

export async function verifyTerminalPaths(): Promise<void> {
  for (const color of [true, false]) {
    for (const animation of [true, false]) {
      const captured = await captureTerminal({
        command: [
          process.execPath,
          "--no-env-file",
          "--no-install",
          "scripts/catalog/terminal-runner.ts",
          "task-running-partial",
          "40",
          "live",
        ],
        cols: 40,
        rows: 20,
        steps: [{ waitFor: "Compile sources" }],
        holdMs: 0,
        env: {
          ...(color ? {} : { NO_COLOR: "1" }),
          HAMIO_CATALOG_ANIMATION: animation ? "1" : "0",
        },
      });
      const text = output(captured.cast);
      if (!text.includes("2/4") || !text.includes("running"))
        throw new Error(`TTY color=${color}, animation=${animation} lost progress or state.`);
      const colored = [31, 32, 33, 34, 35, 36].some((code) =>
        text.includes(`${String.fromCharCode(27)}[${code}m`),
      );
      if (colored !== color)
        throw new Error(`TTY color=${color} emitted the wrong ANSI color policy.`);
      if (/[|/\\] running/.test(text) !== animation)
        throw new Error(`TTY animation=${animation} emitted the wrong motion policy.`);
    }
  }

  const cases: readonly (readonly [string, string])[] = [
    ["run-group-mixed", "+ succeeded  Run result"],
    ["task-failed", "code: BUILD_FAILED"],
    ["task-running-indeterminate", "unknown"],
    ["table-narrow-long-redacted", "[redacted]"],
    ["content-cjk", "日本語の進捗"],
  ];
  for (const [id, expected] of cases) {
    const captured = await captureTerminal({
      command: [
        process.execPath,
        "--no-env-file",
        "--no-install",
        "scripts/catalog/terminal-runner.ts",
        id,
        "40",
      ],
      cols: 40,
      rows: 25,
      steps: [{ waitFor: expected }],
      holdMs: 0,
    });
    if (!output(captured.cast).includes(expected)) throw new Error(`TTY ${id} lost ${expected}.`);
  }

  const completed = await captureTerminal({
    command: [
      process.execPath,
      "--no-env-file",
      "--no-install",
      "scripts/catalog/terminal-runner.ts",
      "run-group-mixed",
      "80",
      "live",
    ],
    cols: 80,
    rows: 20,
    steps: [{ waitFor: "Run result" }],
    holdMs: 0,
  });
  const completion = output(completed.cast);
  if (!completion.includes("+ succeeded  Run result") || !completion.includes("code: BUILD_FAILED"))
    throw new Error("Live TTY completion lost the independent Run result or earlier Task Failure.");
  if (completion.includes("\u001b[?25l"))
    throw new Error("Live TTY hid the cursor without cleanup.");

  const child = Bun.spawn(
    [
      process.execPath,
      "--no-env-file",
      "--no-install",
      "scripts/catalog/terminal-runner.ts",
      "task-running-partial",
      "40",
      "live",
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, NO_COLOR: "1", HAMIO_CATALOG_ANIMATION: "1" },
    },
  );
  const text = await new Response(child.stdout).text();
  if ((await child.exited) !== 0 || !text.includes("2/4") || text.includes("\u001b"))
    throw new Error("non-TTY path lost plain progress or emitted cursor/ANSI control.");
}
