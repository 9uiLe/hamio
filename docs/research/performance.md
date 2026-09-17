# 性能特性と測定の技術資料

確認日: 2026-09-17。対象は、Bun を同梱した UI 実行ファイルの起動、メモリ、並列処理、計測 API である。根拠は Bun の公式ドキュメントと API リファレンスとし、採用する固定版で再確認する。

hamio の性能責務は、入力、表示、通知の受信、起動が利用側の業務へ加える負荷を制御することである。業務の並列数と実行順序は利用側が管理する。合否は [基本設計の性能予算](../design.md#性能予算) で評価する。本書は測定方法の技術資料であり、製品の測定結果ではない。

## 起動と配布形式

`bun build --compile` は、同梱コードのファイル解決、読み出し、変換等をビルド時へ移す。`--bytecode` は JavaScript の解析を前倒しし、`--minify` は変換後コードを縮小する。bytecode はビルド時の処理を増やす。[Bun: Single-file executable](https://bun.com/docs/bundler/executables)

実際の起動時間は UI 依存、設定、初期化、バイナリの大きさも含めて測定する。公式の別プログラムの高速化倍率を hamio の予測値には用いない。起動から入力可能になる時間と、機械向けの結果を取得して終了する時間を別に扱う。

JIT の最適化段階を進める閾値を調整する compile オプションもある。通常設定の結果から必要性を判断し、起動時間だけでなく処理全体の時間とメモリへの影響を比較する。[Bun: Executable JIT policy](https://bun.com/docs/bundler/executables#jit-policy)

Nix 開発環境での TypeScript 直接実行と、配布する実行ファイルは別の測定対象である。開発環境の初回導入、ビルド、CLI 実行の時間を分けて記録する。

## メモリとガベージコレクション

`--smol` はガベージコレクション（GC）の頻度を増やしてヒープの成長を抑え、実行が遅くなる可能性がある。Bun はこの設定の有無にかかわらず、利用可能メモリを考慮して GC のヒープサイズを調整する。[Bun: smol](https://bun.com/docs/runtime#bun-run-smol)

Worker の `smol: true` は `JSC::HeapSize` を Small に設定する。これもメモリと速度の交換条件を持つ。[Bun: Worker smol](https://bun.com/docs/runtime/workers#memory-usage-with-smol)

省メモリ設定の比較では、入力遅延、総 CPU 時間、GC 後の使用量を同時に見る。`smol` をプロセス全体のメモリ上限として扱わない。強制 GC は診断条件として管理し、通常の応答性能測定へ混ぜない。

## 非同期処理と Worker

Bun のストリームは、全データをメモリへ読み込まず、分割して処理できる。公式文書は `ReadableStream` の `for await` と、受信側の混雑に応じて送信を制御する backpressure を説明する。[Bun: Streams](https://bun.com/docs/runtime/streams)

I/O の待機と、JSON の解析・検証・整形に使う CPU 時間は別に観測する。非同期 API を使ったことだけでは、CPU 処理が複数コアで並列実行されるとは判断できない。

Bun の Worker は別スレッド上の新しい JavaScript インスタンスを作り、メインスレッドと I/O 資源を共有する。`node:worker_threads` は計算量の多い JavaScript をメインのイベントループから移す用途を説明している。[Bun: Workers](https://bun.com/docs/runtime/workers)、[worker_threads reference](https://bun.com/reference/node/worker_threads)

Worker は experimental とされ、特に終了処理への言及がある。メッセージは通常 structured clone で扱われ、一部の型には最適化経路がある。`close` イベントの時点で完全終了済みとは限らず、メッセージリスナーは Worker の生存を維持する。[Bun: Worker lifecycle](https://bun.com/docs/runtime/workers)

Worker の比較対象には初期化、状態保持、通信、最後の応答、終了を含める。業務 task の数に合わせて UI 用 Worker を増やすことはせず、単一スレッドより効果が確認できる範囲で同時数を制限する。

## 計測指標

| 指標・API                                                                            | 公式仕様と用途                                                                                                  |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| [経過時間](https://bun.com/docs/project/benchmarking)                                | `performance.now()` / `Bun.nanoseconds()` を利用できる。公式は CLI 全体の計測に `hyperfine` を紹介する          |
| [bun:jsc memoryUsage()](https://bun.com/reference/bun/jsc/memoryUsage)               | JS ヒープ外を含む。`current` は Linux で RSS、macOS で phys_footprint。`peak` は生存期間中の `current` の最大値 |
| [Bun.unsafe.memoryFootprint()](https://bun.com/reference/bun/unsafe)                 | macOS で phys_footprint、Linux で共有ページを按分する PSS。取得できない環境では `undefined`                     |
| [heapSize()](https://bun.com/reference/bun/jsc/heapSize)                             | 直近 GC 後の生存オブジェクトと、それらが所有するヒープ外領域。GC 後の新規割当は含まない                         |
| [heapStats()](https://bun.com/reference/bun/jsc/heapStats)                           | ヒープ全体を走査する。`extraMemorySize` は `heapSize` / `heapCapacity` に含まれ、再加算しない                   |
| [Subprocess.resourceUsage()](https://bun.com/reference/bun/Subprocess/resourceUsage) | 測定用親プロセスから終了後に取得する。CPU は microseconds、maxRSS は bytes                                      |

RSS、PSS、phys_footprint は異なる尺度である。メモリ予算には OS、取得 API、単位を指定し、macOS の `memoryUsage().peak` と `Subprocess.resourceUsage().maxRSS` を置き換えて判定しない。

JavaScript のヒープとプロセス全体を両方観測する。GC 前の増加だけでメモリ漏れと断定せず、入力停止後、回収後、繰り返し実行後の推移を見る。短いピークを定期取得だけで見逃さないよう、最大値と時系列を併用する。

### 互換 API の制約

Bun の `node:worker_threads` は `resourceLimits` を無視する。`node:perf_hooks` の `eventLoopUtilization()` は常にゼロ、`worker.performance.eventLoopUtilization()` は stub とされる。[Bun: Node.js compatibility](https://bun.com/docs/runtime/nodejs-compat)

したがって `resourceLimits` をメモリ制限に使わず、上記の返り値を CPU の余裕の根拠にしない。実際の CPU 時間、経過時間、応答遅延で評価する。

## 観測負荷

Bun は JavaScript のヒープとネイティブ側のヒープを持ち、ネイティブ側には mimalloc を使う。CPU プロファイル、終了時のヒーププロファイル、ネイティブヒープのダンプ等の診断機能を提供する。[Bun: Benchmarking](https://bun.com/docs/project/benchmarking)

`heapStats()` は `heapSize()` より重く、メモリ漏れの比較前に full GC の条件をそろえる方法が説明されている。[Bun: heapStats](https://bun.com/reference/bun/jsc/heapStats)

プロファイル、ヒープスナップショット、強制 GC を有効にした値は診断用として扱う。通常測定では指標の取得頻度と観測負荷を確認し、原因調査が必要な区間だけ詳しく測る。プロセス内の時刻だけでなく、呼び出し元から見た起動待ちも測定する。

## 測定計画

| 観点     | 記録・比較する内容                                                             |
| -------- | ------------------------------------------------------------------------------ |
| ビルド   | ソース commit、Bun 版・revision、lockfile、Nix 入力、ビルド設定、バイナリ hash |
| 実行環境 | OS、CPU・コア数、RAM、電源と負荷状態、端末アプリ、画面寸法                     |
| 起動     | 初回と繰り返し、cache の条件、起動から入力可能・結果取得・終了まで             |
| 応答     | キー入力から表示反映、キャンセルから終了、全体経過時間                         |
| 負荷     | 小さいフォーム、無更新待機、通常進捗、大量ログ、遅い受信先                     |
| 並列性   | 業務並列数と同時 run 数、hamio の資源量、業務側の実行時間                      |
| 設定比較 | bytecode、smol、Worker の有無を一条件ずつ変更した結果                          |
| 継続利用 | 長時間受信、完了 task の累積、繰り返し実行後のメモリ推移                       |

中央値、p95、試行数、ばらつきを記録し、予算値・測定 API・環境条件と一緒に保存する。同じ業務を hamio なし・ありで比較し、利用側の JSON 生成、転送、待機を追加コストに含める。未達項目は構成と設定を見直す根拠として扱う。
