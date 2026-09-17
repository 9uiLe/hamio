import { ContractError, type Event, type Level, limited, limits, type Result } from "./contract.ts";
interface Task {
  label: string;
  current?: number;
  total?: number;
}
export class Session {
  private runId: string | undefined;
  private seq = -1;
  private finished = false;
  private readonly seen = new Set<string>();
  readonly active = new Map<string, Task>();
  readonly warnings: { level: Level; text: string }[] = [];
  readonly tasks = { succeeded: 0, failed: 0 };
  private fail(message: string): never {
    throw new ContractError("PROTOCOL_ERROR", message);
  }
  accept(event: Event) {
    if (this.finished) this.fail("The run has already finished.");
    if (event.seq !== this.seq + 1) this.fail("Event seq must start at zero and increase by one.");
    if (this.runId !== undefined && event.runId !== this.runId)
      this.fail("Events must belong to one run.");
    if (this.runId === undefined && event.type !== "run.start")
      this.fail("The first event must be run.start.");
    switch (event.type) {
      case "run.start":
        if (this.runId !== undefined) this.fail("A run can only start once.");
        this.runId = event.runId;
        break;
      case "task.start":
        if (this.seen.has(event.taskId)) this.fail("A task ID cannot be reused.");
        if (this.active.size >= limits.activeTasks || this.seen.size >= limits.totalTasks)
          limited("The task limit was reached.");
        this.seen.add(event.taskId);
        this.active.set(event.taskId, { label: event.label });
        break;
      case "task.progress": {
        const task = this.active.get(event.taskId);
        if (!task) this.fail("Progress requires an active task.");
        if (
          (task.current !== undefined && event.current < task.current) ||
          (task.total !== undefined && event.total !== task.total)
        )
          this.fail("Progress must increase against the same total.");
        task.current = event.current;
        task.total = event.total;
        break;
      }
      case "task.finish":
        if (!this.active.delete(event.taskId)) this.fail("Only an active task can finish.");
        this.tasks[event.status]++;
        break;
      case "message":
        if (event.level === "warning" || event.level === "error") {
          if (this.warnings.length >= limits.warnings) limited("The warning limit was reached.");
          this.warnings.push({ level: event.level, text: event.text });
        }
        break;
      case "run.finish":
        if (this.active.size) this.fail("All active tasks must finish before the run.");
        this.finished = true;
        break;
    }
    this.seq = event.seq;
  }
  summary(result: Result) {
    if (!this.finished || this.runId === undefined) this.fail("The run has not finished.");
    return {
      apiVersion: 1,
      status: "ok",
      runId: this.runId,
      result,
      tasks: this.tasks,
      warnings: this.warnings,
    };
  }
  progressText() {
    const first = this.active.values().next().value;
    const detail = first
      ? `${first.label}${first.total === undefined ? "" : ` ${first.current ?? 0}/${first.total}`}`
      : "処理の完了待ち";
    return `${detail}  │ 実行中 ${this.active.size} · 完了 ${this.tasks.succeeded} · 失敗 ${this.tasks.failed}`;
  }
}
