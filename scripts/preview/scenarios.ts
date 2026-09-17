import type { CaptureOptions } from "./capture.ts";

export const scenarios = [
  {
    name: "fixture",
    description: "録画基盤のサンプル。製品 UI は未実装。",
    command: [process.execPath, "--no-env-file", "--no-install", "scripts/preview/fixture.ts"],
    cols: 80,
    rows: 20,
    steps: [
      { waitFor: "Enter でサンプルを進める", snapshot: "input", send: "\r" },
      { waitFor: "プレビュー完了", snapshot: "result" },
    ],
  },
] satisfies (CaptureOptions & { name: string; description: string })[];
