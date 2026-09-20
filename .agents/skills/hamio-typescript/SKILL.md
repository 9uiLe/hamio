---
name: hamio-typescript
description: hamio の TypeScript 実装・変更・レビューで、境界検証、状態の型表現、非同期処理、strict 設定を適用する。
---

# TypeScript の実践指針

機械的な規則は [tsconfig.json](../../../tsconfig.json)・[biome.json](../../../biome.json)と診断を正本とする。レビューでは次を確認する。

- JSON、環境変数、ファイル、子プロセスの結果を `unknown` から実行時検証で絞る。型アサーションだけで入力を信頼しない。
- 成功・キャンセル・不足・エラーを判別可能な union で表し、不可能な組み合わせと未処理の分岐を減らす。optional の欠落と明示的 `undefined` を区別する。
- Promise は返す、await する、または失敗処理と寿命のある背景処理にする。`void` をエラー処理の代わりにしない。
- I/O の並行実行に上限・キャンセルを設け、timer・listener・pipe を終了時に片付ける。`async` を CPU 処理の並列化とみなさない。
- 秘密値を診断へ流さない。単純な契約を複雑な条件型で隠さない。

Bun での実行成功は型検査の代わりにならない。`bun run typecheck` と対象テストを実行し、宣言ファイルの問題を `skipLibCheck` や一括 suppression で隠さない。全体検査は [AGENTS.md](../../../AGENTS.md)に従う。
