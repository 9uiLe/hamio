# 製品 API の性能評価

API v1 の配布用実行ファイルを対象に、起動から応答取得までの初期基準値を測定する。開発用の TS 実行と Preview の生成時間は含めない。結果の生データ、各サンプル、ソースとバイナリの SHA-256 は [api-performance.json](api-performance.json) に保存する。

## 条件と測定方法

- 2026-09-17、macOS 26.2 / Darwin 25.2.0、Apple M1 Pro、10 core、16 GiB RAM、arm64。
- Bun 1.4.2。flake.lock の Nixpkgs が版と hash を固定する公式 Bun ランタイムを埋め込み、Nix 向け loader 修正は含めない。minify 有効、bytecode と smol は使用しない。
- 各条件2回のウォームアップ後、新しいプロセスで30回、直列に測定する。OS cache は温まった状態。プロファイラー、強制 GC、並行ベンチマークは使用しない。
- 通常のデスクトップ上で測定し、他プロセスと電源状態を完全には固定していない。cold start、Linux、別 CPU は未測定。
- フォームと表示の入力は `examples/form.json`、`examples/display.json`。フォームの提供値は40 bytes。ストリームは100 taskを開始し、指定件数の進捗を送り、全 task と run を終了する。警告とエラーは含めない。
- 経過時間は親側の `performance.now()` で spawn から終了・stdout/stderr 取得まで、CPU と maxRSS は終了後の `Subprocess.resourceUsage()` で測る。CPU は microseconds から ms、maxRSS は bytes から MiBへ変換する。[Bun の測定 API](https://bun.com/reference/bun/Subprocess/resourceUsage)
- maxRSS は当該プロセスの API 報告値であり、定常 RSS・PSS・macOS footprint と同じ指標ではない。計測用の親プロセスの CPU とメモリは含めない。

p95 は nearest-rank、30回では小さい順に29番目の値とする。表の CPU・maxRSS は中央値。性能予算全体の達成判定とは分ける。

## 結果

| 条件                                  |   中央値 |      p95 |      CPU |    maxRSS | stdout bytes |
| ------------------------------------- | -------: | -------: | -------: | --------: | -----------: |
| 機能照会                              | 17.24 ms | 18.17 ms | 16.72 ms | 20.92 MiB |           88 |
| 非対話フォーム                        | 20.79 ms | 21.97 ms | 20.25 ms | 23.42 MiB |          111 |
| JSON 表示                             | 21.77 ms | 27.50 ms | 21.22 ms | 23.89 MiB |          610 |
| 100 task の開始・完了                 | 21.80 ms | 22.54 ms | 24.59 ms | 27.70 MiB |          124 |
| 100 task + 2,000進捗（最終結果のみ）  | 28.91 ms | 30.44 ms | 42.25 ms | 41.81 MiB |          124 |
| 100 task + 2,000進捗（全 event 出力） | 33.97 ms | 35.02 ms | 51.75 ms | 43.31 MiB |      317,647 |

全条件で stderr は0 bytes。小さい非対話フォームは p95 約22 msで、この入力・環境において100 msの起動予算内に収まった。人向けフォームの入力応答を測った結果ではない。

100 task の完了応答は進捗の有無にかかわらず124 bytesだった。同じ2,000進捗を `--events` で返す場合の317,647 bytesに対し、既定の最終結果だけの出力は99.96%少ない。これは byte 数の比較であり、特定エージェントの token 消費率ではない。

## 検証範囲

機械向けの起動、100同時 task、進捗2,000件の入力と出力量を初期基準とする。人向け UI のキー入力応答、30秒待機時の CPU、長時間 run、複数 run と業務の並列実行、業務全体の5%追加時間予算、各 OS の端末と tokenizer は別の測定を必要とする。

macOS の実行ファイルについては、Bun を PATH に含めずに実行できること、`.env` と `bunfig.toml` を読み込まないことを試験した。`otool -L` の依存は `/usr/lib` のライブラリだけで、実行ファイル内に `/nix/store/` 参照がないことをテストする。OS の標準ライブラリは必要であり、すべての macOS 版を保証する検証ではない。

## 再計測

```sh
nix develop
bun run build
bun scripts/benchmark-api.ts dist/benchmarks/api.json 30
```

固定したソース、lockfile、入力、マシン、測定 API と単位を揃えて比較する。記録したソース hash が異なる場合は別の測定条件として扱う。ベンチマークは通常の check・hooks・PR の CI では実行しない。
