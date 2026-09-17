// A consumer scenario: all terminal output comes from the real product CLI.
export {};
const cli = [process.execPath, "--no-env-file", "--no-install", "src/cli.ts"];
async function run(args: string[]) {
  const child = Bun.spawn([...cli, ...args], {
    stdin: "inherit",
    stdout: "pipe",
    stderr: "inherit",
  });
  const [code, response] = await Promise.all([child.exited, new Response(child.stdout).text()]);
  if (code !== 0) throw new Error("The product preview did not complete.");
  return response;
}
await run([
  "form",
  "--definition",
  "examples/form.json",
  "--interactive",
  "always",
  "--color",
  "always",
]);
const progress = Bun.spawn([...cli, "stream", "--format", "human", "--color", "always"], {
  stdin: "pipe",
  stdout: "pipe",
  stderr: "inherit",
});
let seq = 0;
function send(type: string, data: Record<string, unknown>) {
  progress.stdin.write(
    `${JSON.stringify({ apiVersion: 1, runId: "preview", seq: seq++, type, ...data })}\n`,
  );
  progress.stdin.flush();
}
send("run.start", { title: "入力・進捗・表示を確認" });
send("task.start", { taskId: "validation", label: "設定を検証" });
send("task.progress", { taskId: "validation", current: 1, total: 2 });
await Bun.sleep(350);
send("task.progress", { taskId: "validation", current: 2, total: 2 });
send("task.finish", { taskId: "validation", status: "succeeded" });
send("run.finish", { result: { success: true, message: "進捗の確認完了" } });
progress.stdin.end();
const [code] = await Promise.all([progress.exited, new Response(progress.stdout).text()]);
if (code !== 0) throw new Error("The progress preview failed.");
await run(["render", "--input", "examples/display.json", "--format", "human", "--color", "always"]);
