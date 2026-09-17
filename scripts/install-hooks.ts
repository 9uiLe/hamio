import { spawnSync } from "node:child_process";
import installHusky from "husky";

const existing = spawnSync("git", ["config", "--get", "core.hooksPath"], {
  encoding: "utf8",
});
if (existing.status !== 0 && existing.status !== 1) {
  throw new Error(`Cannot read Git hooks configuration: ${existing.stderr}`);
}
const hooksPath = existing.stdout.trim();
if (hooksPath && hooksPath !== ".husky/_") {
  throw new Error(`Existing core.hooksPath=${hooksPath}. Integrate the hooks before replacing it.`);
}

const error = installHusky();
if (error) throw new Error(`Git hooks were not installed: ${error}`);
const installed = spawnSync("git", ["config", "--get", "core.hooksPath"], { encoding: "utf8" });
if (installed.status !== 0 || installed.stdout.trim() !== ".husky/_") {
  throw new Error("Git hooks were not installed. Check HUSKY and repository configuration.");
}
console.log("Installed local pre-commit and pre-push hooks.");
