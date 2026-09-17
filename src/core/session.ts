import { ContractError, type Event, type Level, limited, limits, type Result } from "./contract.ts";

interface Task {
  label: string;
  current?: number;
  total?: number;
}
type State =
  | { phase: "idle" }
  | { phase: "running"; runId: string; seq: number }
  | { phase: "finished"; runId: string; seq: number; result: Result };
export interface Progress {
  readonly first: Readonly<Task> | undefined;
  readonly active: number;
  readonly succeeded: number;
  readonly failed: number;
}
function fail(message: string): never {
  throw new ContractError("PROTOCOL_ERROR", message);
}

/** Owns one run. No terminal strings, clocks, I/O, or externally mutable collections. */
export class Session {
  private state: State = { phase: "idle" };
  private readonly seen = new Set<string>();
  private readonly active = new Map<string, Task>();
  private readonly warnings: { level: Level; text: string }[] = [];
  private readonly tasks = { succeeded: 0, failed: 0 };

  accept(event: Event): void {
    const state = this.state;
    if (state.phase === "finished") fail("The run has already finished.");
    if (event.seq !== (state.phase === "idle" ? 0 : state.seq + 1))
      fail("Event seq must start at zero and increase by one.");
    if (state.phase !== "idle" && state.runId !== event.runId)
      fail("Events must belong to one run.");
    if (state.phase === "idle" && event.type !== "run.start")
      fail("The first event must be run.start.");
    switch (event.type) {
      case "run.start":
        if (state.phase !== "idle") fail("A run can only start once.");
        break;
      case "task.start":
        if (this.seen.has(event.taskId)) fail("A task ID cannot be reused.");
        if (this.active.size >= limits.activeTasks || this.seen.size >= limits.totalTasks)
          limited("The task limit was reached.");
        this.seen.add(event.taskId);
        this.active.set(event.taskId, { label: event.label });
        break;
      case "task.progress": {
        const task = this.active.get(event.taskId);
        if (!task) fail("Progress requires an active task.");
        if (
          (task.current !== undefined && event.current < task.current) ||
          (task.total !== undefined && event.total !== task.total)
        )
          fail("Progress must increase against the same total.");
        task.current = event.current;
        task.total = event.total;
        break;
      }
      case "task.finish":
        if (!this.active.delete(event.taskId)) fail("Only an active task can finish.");
        this.tasks[event.status]++;
        break;
      case "message":
        if (event.level === "warning" || event.level === "error") {
          if (this.warnings.length >= limits.warnings) limited("The warning limit was reached.");
          this.warnings.push({ level: event.level, text: event.text });
        }
        break;
      case "run.finish":
        if (this.active.size) fail("All active tasks must finish before the run.");
        this.state = {
          phase: "finished",
          runId: event.runId,
          seq: event.seq,
          result: event.result,
        };
        return;
    }
    if (state.phase === "idle")
      this.state = { phase: "running", runId: event.runId, seq: event.seq };
    else state.seq = event.seq;
  }

  snapshot(): Progress {
    const first = this.active.values().next().value;
    return { first: first ? { ...first } : undefined, active: this.active.size, ...this.tasks };
  }

  summary() {
    if (this.state.phase !== "finished") fail("The run has not finished.");
    return {
      apiVersion: 1,
      status: "ok",
      runId: this.state.runId,
      result: this.state.result,
      tasks: { ...this.tasks },
      warnings: this.warnings.map((warning) => ({ ...warning })),
    };
  }
}
