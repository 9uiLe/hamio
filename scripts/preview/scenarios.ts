import type { CaptureOptions } from "./capture.ts";

export const scenarios = [
  {
    name: "fixture",
    description: "録画基盤の検証用サンプル。製品 UI とは別。",
    command: [process.execPath, "--no-env-file", "--no-install", "scripts/preview/fixture.ts"],
    cols: 80,
    rows: 20,
    steps: [
      { waitFor: "Enter でサンプルを進める", snapshot: "input", send: "\r" },
      { waitFor: "プレビュー完了", snapshot: "result" },
    ],
  },
  {
    name: "product",
    description: "製品 CLI の入力、進捗、表示を確認する。業務データはダミー。",
    command: [process.execPath, "--no-env-file", "--no-install", "scripts/preview/product.ts"],
    cols: 80,
    rows: 28,
    steps: [
      { waitFor: "確認する環境を選択", snapshot: "input", send: "\r" },
      { waitFor: "この設定で続行しますか？", send: "y\r" },
      { waitFor: "製品プレビュー完了", snapshot: "result" },
    ],
  },
] satisfies (CaptureOptions & { name: string; description: string })[];
