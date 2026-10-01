import type { PresentationState, Task } from "../presentation/model.ts";

export interface HtmlAnnouncement {
  priority: "polite" | "assertive";
  text: string;
}

function tasks(state: PresentationState): Map<string, Task> {
  const found = new Map<string, Task>();
  for (const item of state.items) {
    if (item.kind === "task") found.set(item.id, item);
    else if (item.kind === "task-group") for (const task of item.tasks) found.set(task.id, task);
  }
  return found;
}

// This derives announcement candidates from accepted snapshots, never from renderer frames or Events.
// Numeric progress is intentionally silent until a live adapter can coalesce it by time and magnitude.
export function htmlAnnouncement(
  previous: PresentationState,
  next: PresentationState,
): HtmlAnnouncement | undefined {
  const beforeRun = previous.run.kind === "present" ? previous.run.value : undefined;
  const afterRun = next.run.kind === "present" ? next.run.value : undefined;
  if (beforeRun?.state.kind === "running" && afterRun?.state.kind === "failed")
    return {
      priority: "assertive",
      text: `Run failed: ${afterRun.title}. ${afterRun.state.failure.message}`,
    };
  if (beforeRun?.state.kind === "running" && afterRun && afterRun.state.kind !== "running")
    return { priority: "polite", text: `Run ${afterRun.state.kind}: ${afterRun.title}` };
  if (!beforeRun && afterRun) return { priority: "polite", text: `Run started: ${afterRun.title}` };

  const beforeTasks = tasks(previous);
  for (const [id, task] of tasks(next)) {
    const before = beforeTasks.get(id);
    if (before?.state.kind === task.state.kind) continue;
    if (task.state.kind === "failed")
      return {
        priority: "polite",
        text: `Task failed: ${task.label}. ${task.state.failure.message}`,
      };
    if (task.state.kind === "succeeded" || task.state.kind === "cancelled")
      return { priority: "polite", text: `Task ${task.state.kind}: ${task.label}` };
    if (task.state.kind === "running")
      return { priority: "polite", text: `Task started: ${task.label}` };
  }

  for (let index = previous.items.length; index < next.items.length; index++) {
    const item = next.items[index];
    if (item?.kind === "message" && (item.level === "warning" || item.level === "error"))
      return { priority: "polite", text: `${item.level}: ${item.text}` };
  }
  return undefined;
}
