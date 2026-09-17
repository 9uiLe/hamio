---
name: hamio-performance
description: hamio の起動、入力応答、メモリ、CPU、event 量、並列性の変更・性能調査で、利用側への負荷と測定条件を評価する。
---

# パフォーマンス

[基本設計の性能設計](../../../docs/design.md#7-性能設計)を読み、対象の利用シナリオと予算を選ぶ。ランタイムの測定 API を使う場合は [性能資料](../../../docs/research/performance.md) の該当箇所を確認する。

## 比較する対象

- 同じ業務を hamio なし・ありで比べる。利用側の JSON 生成、転送、待機、補助プロセスも追加コストに含める。
- 配布実行ファイルと開発時の TS 実行、初回と warm 起動、通常測定と profile・強制 GC を分ける。
- ソース、lockfile、Bun 版、ビルド設定、OS、CPU、RAM、端末、入力規模、API・単位、試行数を残す。中央値と遅い側の分布を記録する。
- RSS、PSS、macOS footprint、JS heap を混ぜない。同一プロセスの Worker 分を重複加算しない。Bun の stub API を低負荷の根拠にしない。

## 設計上の着眼点

進捗は task ごとの最新状態へ集約し、フレーム、待ち行列、履歴、活動中 task に上限を置く。完了済み task が長時間利用で蓄積しないことを確認する。

業務の並列数は利用側に残す。UI のプロセス・Worker を event ごとに増やさず、ビルドやテストと CPU・メモリを共有する。Worker は生成・転送・終了を含めて効果がある場合に採用する。

遅い出力先には混雑時の規則を適用する。途中の進捗を集約しても、重要な失敗・警告・回答を黙って捨てない。無期限待機、busy loop、機械モードの animation を避ける。

## 検証と報告

変更した経路に応じて、小さい呼び出し、大量 event、遅い受信先、長時間反復、中断、並列業務を選ぶ。計測していない数値を達成値として報告しない。通常の Lint や単体テストの成功を、製品の性能予算の達成に置き換えない。

`smol`、bytecode、キャッシュ、Worker の追加は一条件ずつ比較し、改善値と悪化した指標を併記する。予算の変更には利用シナリオと根拠を残す。

## 一次情報

- [Bun の実行ファイル](https://bun.com/docs/bundler/executables)
- [Bun Workers](https://bun.com/docs/runtime/workers)
- [Bun の測定機能](https://bun.com/docs/project/benchmarking)
