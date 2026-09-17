import pkg from "../../package.json";
import { releaseIdentity } from "./metadata.ts";

const { tag } = releaseIdentity(pkg.version, process.platform, process.arch);
if (
  process.env.GITHUB_REPOSITORY !== "9uiLe/hamio" ||
  process.env.GITHUB_REF !== `refs/tags/${tag}`
) {
  throw new Error(`Release must run in 9uiLe/hamio at refs/tags/${tag}.`);
}
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
const commands = [["git", "merge-base", "--is-ancestor", "HEAD", "origin/master"]];
for (const command of commands) {
  const result = Bun.spawnSync(command, { stdout: "inherit", stderr: "inherit" });
  if (result.exitCode !== 0) throw new Error(`Release preflight failed: ${command.join(" ")}`);
}
