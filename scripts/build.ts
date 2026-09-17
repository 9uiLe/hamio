import { resolve } from "node:path";
import { buildExecutable } from "./build/compiler.ts";

const runtime = process.env.HAMIO_BUN_RUNTIME;
if (!runtime) throw new Error("Use the pinned Nix development shell to build hamio.");
const output = resolve(process.argv[2] ?? "dist/hamio");
await buildExecutable({ root: process.cwd(), runtime, output });
console.log(`Built ${output} for the current OS and architecture.`);
