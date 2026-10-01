// Retain v1's bounded run scale while Phase 3 measures the cost of keeping completed tasks.
export const stateLimits = {
  tasks: 10_000,
  activeTasks: 100,
  items: 10_000,
  columns: 16,
  rows: 200,
  treeDepth: 16,
  treeNodes: 20_000,
  structuredDepth: 16,
  structuredNodes: 20_000,
} as const;
