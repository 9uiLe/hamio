import { mkdir } from "node:fs/promises";

const runtime = process.env.HAMIO_BUN_RUNTIME;
if (!runtime || !(await Bun.file(runtime).exists())) {
  throw new Error("Use the pinned Nix development shell to build hamio.");
}
await mkdir("dist", { recursive: true });
const build = await Bun.build({
  entrypoints: ["src/cli.ts"],
  compile: {
    outfile: "dist/hamio",
    executablePath: runtime,
    autoloadDotenv: false,
    autoloadBunfig: false,
    autoloadPackageJson: false,
    autoloadTsconfig: false,
    execArgv: ["--no-install"],
  },
  minify: true,
});
if (!build.success) throw new Error("Could not build hamio.");
console.log("Built dist/hamio for the current OS and architecture.");
