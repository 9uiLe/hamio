import { appendFile } from "node:fs/promises";
import pkg from "../../package.json";
import { releaseIdentity } from "./metadata.ts";
import { releaseMode } from "./policy.ts";

const { tag } = releaseIdentity(pkg.version, process.platform, process.arch);
const mode = releaseMode(
  process.env.RELEASE_MODE,
  process.env.GITHUB_REPOSITORY,
  process.env.GITHUB_REF,
  tag,
);
if (
  !(await Bun.file("LICENSE").exists()) ||
  !("license" in pkg) ||
  typeof pkg.license !== "string" ||
  pkg.license === "UNLICENSED"
) {
  throw new Error(
    "Public distribution requires the owner's license decision, LICENSE and package.json license metadata.",
  );
}
const status = Bun.spawnSync(["git", "status", "--porcelain"]);
if (status.exitCode !== 0 || status.stdout.length !== 0)
  throw new Error("Release requires a clean worktree.");
const commands =
  mode === "publish" ? [["git", "merge-base", "--is-ancestor", "HEAD", "origin/master"]] : [];
for (const command of commands) {
  const result = Bun.spawnSync(command, { stdout: "inherit", stderr: "inherit" });
  if (result.exitCode !== 0) throw new Error(`Release preflight failed: ${command.join(" ")}`);
}
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `tag=${tag}\n`);
