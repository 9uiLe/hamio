import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { publishAssets } from "./artifacts.ts";
import { checkRuntime, prepareRelease } from "./pipeline.ts";
import { assertSourceUnchanged, captureSource } from "./source.ts";

const root = process.cwd();
const runtimePath = process.env.HAMIO_BUN_RUNTIME;
if (!runtimePath) throw new Error("Use the pinned Nix shell to package hamio.");
const source = await captureSource(root);
const runtimeSha256 = await checkRuntime(runtimePath, root);
await mkdir("dist", { recursive: true });
const workspace = await mkdtemp(resolve("dist/.hamio-package-"));
try {
  const result = await prepareRelease({ source, workspace, runtimePath, runtimeSha256 });
  await assertSourceUnchanged(root, source);
  await publishAssets(result.output, resolve("dist/release"));
  console.log(JSON.stringify({ ...result, output: "dist/release", binary: undefined }));
} finally {
  await rm(workspace, { recursive: true, force: true });
}
