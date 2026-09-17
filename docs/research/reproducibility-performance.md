# 配布基盤と実行経路の評価

hamio の実行経路と配布基盤を対象に、性能と生成物の再現性を評価した記録である。製品の公開契約は API v1 とし、基準版と評価版で同じ入力に対する pipe の stdout・stderr が全試行で一致することを確認した。実装の責務と依存方向は[実装設計](../implementation.md)に定める。

## 対象と測定条件

- 基準版は [5a96bf52e518858d2c38b23e46ba36c2f915ab21](https://github.com/9uiLe/hamio/commit/5a96bf52e518858d2c38b23e46ba36c2f915ab21) から生成した実行ファイル。
- 評価版の実行ファイルは SHA-256 `dd45f29f67ba6687a186a9004c616159f675d1409fe690edd7d6ceae284c4c82`。基準版は `d33ac53428e0fe6bebfa220ef38af3420742d8950fefb179451da52c021c5c2f`。
- [性能の生データ](reproducibility-performance.json)に対象ソース、lockfile、測定スクリプトの hash、入力と出力の hash、全サンプルを記録した。配布処理の検証と進捗表示の生データは[再現性・描画の記録](reproducibility-checks.json)に置く。各記録の hash がそれぞれの検証対象を特定する。性能測定の評価版と再現性検査で展開した製品実行ファイルの hash は一致する。
- 2026-09-17、Darwin 25.2.0、Apple M1 Pro、10 core、16 GiB RAM、macOS arm64。Bun 1.4.2、revision `744846f844374847c902b5e7fd59b4342a51ef99`。両版とも同じ Nix 入力と公式 Bun を使い、minify 有効、bytecode・smol なし。
- [benchmark-refactor.ts](../../scripts/benchmark-refactor.ts)で各条件・各版2回の warmup 後、新規プロセスを30回ずつ起動。各組で実行順を反転する。OS cache は温まっており、cold start は測っていない。
- wall time は親の `performance.now()` で起動から終了・出力取得まで、CPU は子の `resourceUsage().cpuTime.total` を ms に換算する。メモリは同 API の maxRSS を MiB に換算する。p95 は nearest-rank の29番目、CPU と maxRSS は中央値。[Bun の測定 API](https://bun.com/reference/bun/Subprocess/resourceUsage)
- 測定中は別の benchmark、build、test を並行実行しない。通常のデスクトップで測定し、他の常駐プロセスや電源状態は完全には固定していない。小さい差には測定間の揺れが含まれる。

32表の条件は各20行×4列、日本語を含む61,147 bytesの入力である。stream は100 taskを開始し、指定件数の進捗の後に全 taskと runを完了する。4プロセスの wall time は全プロセスの完了まで、CPU は合計、maxRSS は各子の peak の合計であり、同時点のメモリ使用量や専有物理メモリを表さない。親プロセスの CPU・メモリは含まない。

## 処理時間・CPU・メモリ

各セルは基準版 → 評価版。

| 条件                               |     中央値 ms |        p95 ms |          CPU ms |      maxRSS MiB |
| ---------------------------------- | ------------: | ------------: | --------------: | --------------: |
| 機能照会                           | 17.57 → 17.38 | 18.88 → 21.94 |   16.17 → 16.06 |   20.75 → 20.77 |
| 非対話フォーム                     | 20.42 → 20.49 | 21.04 → 21.22 |   19.15 → 19.18 |   23.25 → 23.34 |
| JSON 表示                          | 18.97 → 19.37 | 20.05 → 20.91 |   17.84 → 18.24 |   22.70 → 22.91 |
| 32表の生成・出力                   | 23.13 → 23.65 | 25.44 → 24.57 |   25.67 → 26.39 |   27.36 → 28.41 |
| 2,000進捗・最終結果のみ            | 23.97 → 23.74 | 25.06 → 24.53 |   28.78 → 28.85 |   30.44 → 30.16 |
| 20,000進捗・全 event 出力          | 46.36 → 44.09 | 48.57 → 46.45 |   80.52 → 73.86 |   52.38 → 52.09 |
| 4プロセス×20,000進捗・最終結果のみ | 49.13 → 46.37 | 59.34 → 53.65 | 304.74 → 274.03 | 189.02 → 188.33 |
| PTY フォーム・日本語入力           | 45.18 → 45.42 | 48.98 → 47.98 |   34.48 → 34.63 |   26.20 → 26.05 |

2万進捗の全 event 出力は wall time の中央値が4.9%、CPU が8.3%減った。4プロセス同時実行は中央値5.6%、CPU 10.1%減だった。文字列の byte 長の再走査と event ごとの中間オブジェクトを減らした経路を含む比較であり、個々の変更の寄与は分離していない。

小さい呼び出しは一律に速くなっていない。JSON 表示の中央値は2.1%増、32表は中央値2.2%増、CPU 2.8%増、maxRSS は約1.05 MiB増だった。機能照会の p95 は約3.06 ms増えた。端末・入力実装の遅延読み込みは依存境界を明確にするが、この結果から小さい呼び出しの起動高速化は主張しない。

最終結果のみの stream 出力は1 runあたり124 bytes、全 event 出力は2,984,149 bytes、32表の stderr は63,360 bytesで両版とも同じだった。表の条件は pipe への生成・転送時間であり、端末エミュレーターの画面描画時間を含まない。

## 入力応答と進捗の出力量

PTY フォームは80列×24行、`TERM=xterm-256color`、色なし。質問を受け取ると `日本語` と Enter を送り、成功 JSON を待つ。人の入力待ちは含めない。

| 区間                           |     中央値 ms |        p95 ms |
| ------------------------------ | ------------: | ------------: |
| 起動から質問の出力まで         | 42.68 → 42.95 | 46.42 → 45.31 |
| 入力送信から成功 JSON 受信まで | 1.948 → 1.900 | 2.173 → 2.028 |

PTY 出力量は両版330 bytes。ここでの応答はフォーム確定までであり、各キーの描画、IME、実端末の表示遅延を測るものではない。

[benchmark-progress.ts](../../scripts/benchmark-progress.ts)では、同じ実行ファイルを80列×24行の PTY に接続し、stdin の FIFO から150 ms間隔で同じ進捗を10回送った。各版1回 warmup し、順序を交代して5組を測った。開始・完了通知と最終 JSON を含む実際の端末出力を集計する。

| 指標の中央値                    |   基準版 |   評価版 |
| ------------------------------- | -------: | -------: |
| 進捗行の描画回数                |       10 |        1 |
| stdout・stderr 合計 bytes       |      724 |      220 |
| CPU ms                          |   47.689 |   47.502 |
| maxRSS MiB                      |    24.86 |    25.50 |
| 送り手の待機を含む wall time ms | 1,548.63 | 1,547.71 |

同じ文字列の再描画を省くことで、進捗行の書き込みは90%、端末への総出力量は69.6%減った。CPU はほぼ同じで、maxRSS は約0.64 MiB増えた。wall time の大半は送り手の1.5秒の待機であり、描画遅延の改善値には使わない。これは同一表示が続く条件での結果で、値が毎回変わる条件の削減率ではない。

[実行境界の試験](../../tests/runtime.test.ts)では、同じ進捗を省略しても、通知で進捗行を消した後は同じ内容を再描画することを確認する。最大10 fps、遅い出力中の最新状態への集約、終了後の timer 解放も維持する。業務の並列度を hamio が変更したり、event ごとに Worker を生成したりはしない。

## 配布サイズ

| 対象                       | 基準版 bytes | 評価版 bytes |
| -------------------------- | -----------: | -----------: |
| Bun を同梱する実行ファイル |   62,259,954 |   62,259,954 |
| gzip level 9               |   25,556,517 |   25,556,809 |

実行ファイルは約59.4 MiBで同じ、gzip は292 bytes増だった。依存の追加・更新は行っていない。配布処理と試験を製品の import graph に含めず、ランタイムの大きさを本体の整理による削減と取り違えない。異なるランタイムへの移行、bytecode、smol はこの評価の対象外である。[Bun の実行ファイル仕様](https://bun.com/docs/bundler/executables)

## 配布物の再現性と実行

基準版は同じ場所で二回ビルド・梱包したとき、実行ファイル、gzip、checksum、notices、インストーラーが一致し、SBOM は一致しなかった。SBOM の生成時刻を現在時刻から埋め込み、その値を namespace の hash にも使っていた。

評価版の配布処理では、入力収集、ビルド、依存と許諾情報の取得、メタデータ生成、検証、資産の配置を分離する。SBOM の日時は commit 時刻に固定する。これは再現可能な日時を `SOURCE_DATE_EPOCH` に与える考え方に従うもので、Git の commit 時刻を採用している。[SOURCE_DATE_EPOCH](https://reproducible-builds.org/docs/source-date-epoch/)

`release:verify` は次の条件をすべて満たしてから `dist/release/` を置き換える。

1. ビルド入力を内容で取得し、ソース commit、内容 hash、固定ランタイムの hash を確定する。symlink の入力を拒否する。
2. 異なる二つの作業ディレクトリで依存を `bun install --frozen-lockfile --ignore-scripts` により取得し、同じソースから順次ビルド・梱包する。既存の `dist/hamio` を使わない。
3. 全資産の名前と SHA-256 が一致することを確認する。
4. 一つ目の gzip を展開し、実行ファイルの hash を照合する。その実行ファイルを再ビルドせず API・端末試験へ渡す。
5. 入力が検証中に変わっていないことを確認し、検証済み資産一式を配置する。配置が失敗すれば古い資産を復元する。

macOS arm64 で上記を実行し、公開対象の gzip、checksum、SBOM、notices、インストーラーの全5資産が一致した。展開した実行ファイルは性能測定の評価版と同じ hash で、API・実行ファイルの22テストが成功した。秘密の非表示、中断、UTF-8、フォーム、stream、Bun のない PATH、暗黙設定を読むことの防止、PTY 入力を試験に含む。一部の入力・状態の試験は純粋関数を直接検証する。

この検証時点のビルド入力 hash は `d6c0b7a8f94b961598d22fa1299cd53021356d14b2ae32719c078c680bfb7073`。ローカルの未コミット変更を含み、正式なリリースの生成・公開ではない。詳細は[検証記録](reproducibility-checks.json)の `releaseVerification` にある。実際のリリースでは、clean worktree、タグと版、master への包含を preflight で検査し、各対象 runner で同じ再現性検査を行う。

依存取得のディレクトリは独立しているが、同じマシン・OS・ツール・依存キャッシュを使う。別ホスト・別 OS 間の byte 一致や、依存取得元の無害性を証明した結果ではない。provenance、immutable release、導入時の照合と組み合わせる。Bun 内部の native 部品は集約した在庫のままであり、部品別 SBOM の完全性を保証しない。

## 再実行と検証範囲

固定 Nix 環境で基準版を別ディレクトリからビルドし、実行ファイルを `dist/reproducibility/baseline-hamio` に保存する。評価版の生成と測定は以下の入口を使う。

```sh
./scripts/dev.sh bun run build
./scripts/dev.sh bun scripts/benchmark-refactor.ts dist/reproducibility/comparison.json dist/reproducibility/baseline-hamio dist/hamio 30 5a96bf52e518858d2c38b23e46ba36c2f915ab21
./scripts/dev.sh bun scripts/benchmark-progress.ts dist/reproducibility/progress.json dist/reproducibility/baseline-hamio dist/hamio 5
./scripts/dev.sh bun run release:verify
./scripts/preview.sh --recording
./scripts/dev.sh bun run check
```

macOS arm64 で `bun run check` を実行し、56テスト、Lint、format、型検査、プレビュー照合が成功した。通常の check はソースからの API 試験、一時領域での独立ビルド、配布の失敗処理、実行ファイル、描画の寿命、hooks、プレビュー照合を検証する。再現性検査の二回の依存取得・圧縮・展開後試験は `release:verify` と Release workflow で行い、通常の検査や hook に圧縮負荷を加えない。

製品 CLI から入力・進捗・結果を録画し、[PNG](../previews/README.md)と GIF の全フレームを目視確認した。Linux の実行、公開済み資産の取得・署名検証、別ホストでの再現性は本記録のローカル検証に含まない。性能の未測定範囲は cold start、長時間の連続使用、30秒待機 CPU、PSS・macOS footprint、実端末・IME・画面読み上げ、利用側の JSON 生成や実際のビルド・テストを含む業務全体である。基本設計の全性能予算の達成を示す結果ではない。
