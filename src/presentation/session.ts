import { stateError, stateLimit, transitionError } from "./error.ts";
import { stateLimits } from "./limits.ts";
import type {
  PresentationEvent,
  PresentationItem,
  PresentationState,
  ProgressState,
  Task,
  TaskGroup,
} from "./model.ts";
import { validateContent, validateProgress, validateResult } from "./validate.ts";

type MutableGroup = Omit<TaskGroup, "tasks"> & { tasks: Task[] };

function isNone(progress: ProgressState): boolean {
  return progress.kind === "none";
}

export class PresentationSession {
  private run: PresentationState["run"] = { kind: "none" };
  private readonly items: PresentationItem[] = [];
  private readonly tasks = new Map<string, Task>();
  private readonly groups = new Map<string, MutableGroup>();
  private readonly ids = new Set<string>();
  private nextSeq = 0;
  private active = 0;
  private unfinished = 0;
  private semanticItems = 0;

  accept(input: PresentationEvent): void {
    const event = structuredClone(input);
    if (this.nextSeq >= Number.MAX_SAFE_INTEGER) stateLimit("Event sequence limit exceeded.");
    if (event.seq !== this.nextSeq)
      transitionError("Event seq must start at zero and be contiguous.");
    if (event.runId.length === 0) stateError("Run ID must not be empty.");
    if (this.run.kind === "none") {
      if (event.type !== "run.started") transitionError("First event must be run.started.");
    } else {
      if (this.run.value.state.kind !== "running") transitionError("Run already finished.");
      if (event.runId !== this.run.value.id) transitionError("Event belongs to another run.");
    }

    switch (event.type) {
      case "run.started":
        if (this.run.kind !== "none") transitionError("Run can start only once.");
        if (event.title.length === 0) stateError("Run title must not be empty.");
        this.run = {
          kind: "present",
          value: { id: event.runId, title: event.title, state: { kind: "running" } },
        };
        break;
      case "task-group.declared": {
        this.requireCapacity(event.groupId);
        if (event.label.length === 0) stateError("Task group label must not be empty.");
        const group: MutableGroup = {
          kind: "task-group",
          id: event.groupId,
          label: event.label,
          tasks: [],
        };
        this.groups.set(event.groupId, group);
        this.ids.add(event.groupId);
        this.items.push(group);
        this.semanticItems++;
        break;
      }
      case "task.declared": {
        this.requireCapacity(event.taskId);
        if (this.tasks.size >= stateLimits.tasks) stateLimit("Task limit exceeded.");
        if (event.label.length === 0) stateError("Task label must not be empty.");
        if (event.placement.kind !== "root" && event.placement.kind !== "group")
          stateError("Task placement is invalid.");
        const group =
          event.placement.kind === "group" ? this.groups.get(event.placement.groupId) : undefined;
        if (event.placement.kind === "group" && !group)
          transitionError("Task group must be declared first.");
        const task: Task = {
          kind: "task",
          id: event.taskId,
          label: event.label,
          state: { kind: "pending" },
        };
        this.tasks.set(event.taskId, task);
        this.ids.add(event.taskId);
        this.unfinished++;
        if (group) group.tasks.push(task);
        else this.items.push(task);
        this.semanticItems++;
        break;
      }
      case "task.started": {
        const task = this.task(event.taskId);
        if (task.state.kind !== "pending") transitionError("Only a pending task can start.");
        if (this.active >= stateLimits.activeTasks) stateLimit("Active task limit exceeded.");
        task.state = { kind: "running", progress: { kind: "none" } };
        this.active++;
        break;
      }
      case "task.progressed": {
        const task = this.task(event.taskId);
        if (task.state.kind !== "running") transitionError("Progress requires a running task.");
        if (isNone(event.progress)) transitionError("Progress event cannot publish none.");
        validateProgress(event.progress);
        this.checkProgress(task.state.progress, event.progress);
        task.state = { kind: "running", progress: event.progress };
        break;
      }
      case "task.finished": {
        const task = this.task(event.taskId);
        validateResult(event.result);
        if (task.state.kind === "pending" && event.result.kind !== "cancelled")
          transitionError("A pending task can only be cancelled.");
        if (task.state.kind !== "pending" && task.state.kind !== "running")
          transitionError("Task already finished.");
        if (task.state.kind === "running") this.active--;
        this.unfinished--;
        task.state = event.result;
        break;
      }
      case "content.published":
        validateContent(event.item);
        this.requireItemCapacity();
        this.items.push(event.item);
        this.semanticItems++;
        break;
      case "run.finished":
        validateResult(event.result);
        if (this.unfinished !== 0) transitionError("All tasks must finish before the run.");
        if (this.run.kind !== "present") transitionError("Run has not started.");
        this.run.value.state = event.result;
        break;
      default:
        transitionError("Event type is invalid.");
    }
    this.nextSeq++;
  }

  snapshot(): PresentationState {
    return structuredClone({ run: this.run, items: this.items });
  }

  private task(id: string): Task {
    const task = this.tasks.get(id);
    if (!task) transitionError("Task has not been declared.");
    return task;
  }

  private requireCapacity(id: string): void {
    if (id.length === 0) stateError("ID must not be empty.");
    if (this.ids.has(id)) transitionError("Task or group ID cannot be reused.");
    this.requireItemCapacity();
  }

  private requireItemCapacity(): void {
    if (this.semanticItems >= stateLimits.items) stateLimit("Presentation item limit exceeded.");
  }

  private checkProgress(before: ProgressState, after: ProgressState): void {
    if (before.kind !== "determinate") return;
    if (after.kind !== "determinate")
      transitionError("Determinate progress cannot become indeterminate.");
    if (after.total !== before.total || after.current < before.current)
      transitionError("Progress total must stay fixed and current cannot decrease.");
  }
}
