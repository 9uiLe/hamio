import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export interface BuildInput {
  readonly root: string;
  readonly runtime: string;
  readonly output: string;
}

/** Builds only the requested artifact; callers own workspace and runtime selection. */
export async function buildExecutable(input: BuildInput): Promise<void> {
  if (!(await Bun.file(input.runtime).exists()))
    throw new Error("Use the pinned Nix development shell to build hamio.");
  await mkdir(dirname(input.output), { recursive: true });
  const result = await Bun.build({
    root: input.root,
    entrypoints: [resolve(input.root, "src/cli.ts")],
    compile: {
      outfile: input.output,
      executablePath: input.runtime,
      autoloadDotenv: false,
      autoloadBunfig: false,
      autoloadPackageJson: false,
      autoloadTsconfig: false,
      execArgv: ["--no-install"],
    },
    minify: true,
  });
  if (!result.success) throw new Error("Could not build hamio.");
}
