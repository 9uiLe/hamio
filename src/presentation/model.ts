export interface StructuredObject {
  readonly [key: string]: StructuredValue;
}

export type StructuredValue =
  | null
  | boolean
  | number
  | string
  | readonly StructuredValue[]
  | StructuredObject;

export type DataPresence = { kind: "none" } | { kind: "value"; value: StructuredValue };

export interface Failure {
  code: string;
  message: string;
  details: DataPresence;
}

export type Result =
  | { kind: "succeeded"; data: DataPresence; message?: string }
  | { kind: "failed"; failure: Failure }
  | { kind: "cancelled"; reason?: string };

export type ProgressState =
  | { kind: "none" }
  | { kind: "indeterminate" }
  | { kind: "determinate"; current: number; total: number };

export type TaskState = { kind: "pending" } | { kind: "running"; progress: ProgressState } | Result;

export type RunState = { kind: "running" } | Result;
export interface Run {
  id: string;
  title: string;
  state: RunState;
}

export interface Task {
  kind: "task";
  id: string;
  label: string;
  state: TaskState;
}

export interface TaskGroup {
  kind: "task-group";
  id: string;
  label: string;
  tasks: readonly Task[];
}

export type SourceExtent = { kind: "complete" } | { kind: "truncated"; omittedCount?: number };

export type Scalar = null | boolean | number | string;
export type Cell = { kind: "visible"; value: Scalar } | { kind: "redacted" };

export type ContentItem =
  | { kind: "message"; level: "info" | "success" | "warning" | "error"; text: string }
  | { kind: "progress"; label: string; progress: ProgressState }
  | { kind: "result"; result: Result }
  | { kind: "failure"; failure: Failure }
  | {
      kind: "table";
      columns: readonly { key: string; label: string }[];
      rows: readonly (readonly Cell[])[];
      extent: SourceExtent;
    }
  | { kind: "key-value"; entries: readonly { key: string; label: string; value: Cell }[] }
  | { kind: "code"; text: string; language?: string; extent: SourceExtent }
  | {
      kind: "diff";
      lines: readonly { kind: "context" | "added" | "removed"; text: string }[];
      source?: string;
      extent: SourceExtent;
    }
  | { kind: "tree"; nodes: readonly TreeNode[]; extent: SourceExtent }
  | { kind: "summary"; headline: string; points: readonly string[] }
  | { kind: "redacted" };

export interface TreeNode {
  label: string;
  children: readonly TreeNode[];
}

export type PresentationItem = Task | TaskGroup | ContentItem;
export interface PresentationState {
  run: { kind: "none" } | { kind: "present"; value: Run };
  items: readonly PresentationItem[];
}

interface EventBase {
  runId: string;
  seq: number;
}

export type PresentationEvent = EventBase &
  (
    | { type: "run.started"; title: string }
    | { type: "task-group.declared"; groupId: string; label: string }
    | {
        type: "task.declared";
        taskId: string;
        label: string;
        placement: { kind: "root" } | { kind: "group"; groupId: string };
      }
    | { type: "task.started"; taskId: string }
    | {
        type: "task.progressed";
        taskId: string;
        progress: Exclude<ProgressState, { kind: "none" }>;
      }
    | { type: "task.finished"; taskId: string; result: Result }
    | { type: "content.published"; item: ContentItem }
    | { type: "run.finished"; result: Result }
  );
