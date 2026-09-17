---
name: hamio-typescript
description: hamio の TypeScript 実装・変更・レビューで、境界検証、状態の型表現、非同期処理、strict 設定を適用する。
---

# TypeScript の実践指針

[tsconfig.json](../../../tsconfig.json)と [biome.json](../../../biome.json)を基準にする。設定にある規則を文書で再定義せず、コードと診断を確認する。

## 入力と型

- JSON、環境変数、ファイル、子プロセスの結果は未検証入力として扱う。`unknown` から実行時検証で絞り、`as` だけで正当性を作らない。
- `any` と非 null assertion を回避する。配列・辞書の未存在、optional 項目の欠落と明示的 `undefined` の違いを処理する。
- 成功・キャンセル・不足・エラーは判別可能な union で表し、不可能な状態の組み合わせを減らす。分岐では未処理の状態を検出できるようにする。
- 型だけの依存は `import type` を使う。公開境界は明示し、内部の局所的な値は推論を活用する。
- `satisfies` は値の推論を保った適合確認に使う。ジェネリクスは入力と出力の関係を表す場合に使い、複雑な条件型で単純な API を隠さない。

## 非同期と副作用

Promise は呼び出し元へ返す、await する、または失敗処理と寿命を持つ明示的な背景処理にする。`void` はエラー処理の代わりにしない。

I/O の並行実行には上限とキャンセルを設ける。CPU 処理を `async` にしただけで並列化されたとは扱わない。timer、listener、pipe は終了時に片付け、秘密値を診断へ流さない。

Bun の TypeScript 実行は型検査の代わりにならない。`bun run typecheck` と対象のテストを実行する。設定や宣言ファイルの問題を `skipLibCheck` や一括 suppression で隠さない。

## 根拠

- [Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
- [Generics](https://www.typescriptlang.org/docs/handbook/2/generics.html)
- [noUncheckedIndexedAccess](https://www.typescriptlang.org/tsconfig/noUncheckedIndexedAccess.html)
- [exactOptionalPropertyTypes](https://www.typescriptlang.org/tsconfig/exactOptionalPropertyTypes.html)
- [TypeScript の実行](https://bun.com/docs/runtime/typescript)
