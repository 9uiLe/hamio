# hamio v0.1.0 リリース評価

本書は2026-09-17に実施した v0.1.0 の配布・導入検証と、その版に適用できる性能・同梱部品の確認結果を記録する。製品の仕様は[基本設計](design.md)と [API 契約](api.md)、公開の操作と承認条件は[配布手順](distribution.md#保守者のリリース工程)に定める。

[v0.1.0](https://github.com/9uiLe/hamio/releases/tag/v0.1.0) は immutable release として公開済みである。macOS 15 arm64、Ubuntu 24.04 x64 / arm64 の3対象で、配布候補の再現性・動作・由来と、公開資産の導入を確認した。公開は所有者認証の GitHub CLI で行った。候補を作った workflow の publish job は失敗しており、workflow 全体の成功としては扱わない。

## 製品と検証の識別情報

| 項目                          | 対象                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 製品版 / API                  | `v0.1.0` / API v1                                                                                                   |
| 製品ソース commit             | `1c266341fd4d62c9314f6654abda00cd223941fa`                                                                          |
| ビルド入力 SHA-256            | `f665a4f5c22359b011bd37fab345d7759c16031693f16a8224499a514a034f06`                                                  |
| 配布資産                      | 3対象各4資産と共通の `install.sh`、合計13資産                                                                       |
| 候補生成・証明の実行          | [run 35229026857](https://github.com/9uiLe/hamio/actions/runs/35229026857)。workflow と製品は上記のタグ・commit     |
| 公開物の導入試験              | [run 35230519812](https://github.com/9uiLe/hamio/actions/runs/35230519812)。`mode=verify-install`、`version=v0.1.0` |
| 導入検証 workflow             | ref は `fix/release-publication`、commit は `17d19724dd4469dc983c7be8d57ce2e32da33e2a`                              |
| 導入試験の製品・利用側 Action | 公開製品の commit `1c266341fd4d62c9314f6654abda00cd223941fa`                                                        |
| 根拠データ                    | [公開資産・対象別結果の根拠データ](research/initial-release-verification.json)                                      |

製品ソースの commit は公開実行ファイルと利用側 Action の対象を特定し、検証 workflow の commit は試験手順を特定する。導入試験では両者を分け、検証手順のソースで公開製品を再生成していない。

## 配布候補と公開資産の結果

公開タグの build job は各対象で57テストを含む全体検査を通した。`release:verify` は二つの作業ディレクトリで依存取得から梱包まで実行し、全資産の名前と SHA-256 の一致を確認した。API・端末試験には gzip から展開した実行ファイルを渡した。

| 対象               | 比較資産数 | 展開後の API・端末試験 | 実際の provenance | 公開資産の導入・Action |
| ------------------ | ---------: | ---------------------- | ----------------- | ---------------------- |
| macOS 15 arm64     |          5 | 成功                   | 成功              | 成功                   |
| Ubuntu 24.04 x64   |          4 | 成功                   | 成功              | 成功                   |
| Ubuntu 24.04 arm64 |          4 | 成功                   | 成功              | 成功                   |

macOS の5資産には全対象共通の `install.sh` を含む。候補の証明検証は build と別の runner で行い、repository、workflow、source ref、commit、GitHub-hosted runner、圧縮前後の hash を照合した。公開した13資産の SHA-256 はこの候補と一致する。

公開後の試験では、immutable release と資産への帰属、インストーラーの由来、インストーラーと利用側 Action による配置を確認した。独立したローカル Git ディレクトリで、限定した環境変数と Bun・Node.js・Nix のない PATH から版、機能照会、非対話フォームを実行した。別の GitHub リポジトリへの公開操作は試験に含まない。

### 公開工程の制約

候補 workflow は build・attest・verify-candidate が3対象すべて成功したが、publish は immutable releases の管理設定照会が権限不足（403）で失敗し、後続の導入試験も未実行だった。所有者が管理設定、候補と13公開資産の hash・provenance を確認して同じバイト列を公開し、`gh release verify` と独立した導入検証 workflow が成功した。

修正後の workflow commit `17d19724dd4469dc983c7be8d57ce2e32da33e2a` では管理設定の確認を所有者の承認条件へ移した。この commit で実施したのは `verify-install` のみであり、承認から公開までの `publish` 経路は本評価では未検証である。公開・導入の成功を候補 run 全体の成功へ置き換えない。

### 配布サイズ

| 対象        | 実行ファイル（bytes） | gzip（bytes） |
| ----------- | --------------------: | ------------: |
| macOS arm64 |            62,259,954 |    25,556,809 |
| Linux x64   |            81,356,256 |    36,442,779 |
| Linux arm64 |            81,316,136 |    36,353,325 |

公開候補の対象別レポートに記録したサイズである。異なる OS・CPU の値を同一条件の性能差として扱わない。

## 対応範囲と制約

| 項目         | 確認範囲                                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------- |
| OS / CPU     | macOS 15 arm64、Ubuntu 24.04 x64 / arm64（glibc）。古い OS、musl、Intel Mac、Windows は対象外       |
| API          | API v1 の form、render、stream、capabilities。業務処理は利用側が実行                                |
| 実行環境     | 梱包した実行ファイルを開発ランタイムのない PATH から実行                                            |
| 端末         | PTY と固定サイズの製品プレビュー。すべての端末、IME、画面読み上げへの適合は未確認                   |
| 再現性       | 同じ runner・固定入力から別ディレクトリで二回生成した資産の byte 一致。異なるホスト間の一致は未確認 |
| 導入         | 公開資産を使うインストーラーと利用側 Action が3対象で成功                                           |
| 公開の自動化 | 公開製品の候補と導入は検証済み。workflow commit `17d1972` の承認から公開までの自動経路は未実施      |

## 性能の実測範囲

2026-09-17、Darwin 25.2.0、Apple M1 Pro 10 core・16 GiB RAM、Bun 1.4.2 の同梱実行ファイルを測定した。minify 有効、bytecode・smol なし。binary SHA-256 は `dd45f29f67ba6687a186a9004c616159f675d1409fe690edd7d6ceae284c4c82` で公開版の macOS 実行ファイルと一致する。[根拠データ](research/reproducibility-performance.json)は当時の比較測定から評価版の全サンプルを残したもの。ソース・入力・出力の hash、測定条件は保持し、旧版の結果と改善率は本評価に含めない。

[benchmark-refactor.ts](../scripts/benchmark-refactor.ts)で各条件・各版2回 warmup 後、版の順序を交代して各30試行を行った。OS cache は warm。wall time は起動から終了・出力取得まで、p95 は nearest-rank の29番目、CPU と maxRSS は中央値。子の resourceUsage を CPU microseconds → ms、maxRSS bytes → MiB に換算し、親の負荷は含めない。別の benchmark・build・test は並行せず、常駐プロセスや電源状態は完全には固定していない。

| 条件                               | 中央値 ms | p95 ms | CPU ms | maxRSS MiB |
| ---------------------------------- | --------: | -----: | -----: | ---------: |
| 機能照会                           |     17.38 |  21.94 |  16.06 |      20.77 |
| 非対話フォーム                     |     20.49 |  21.22 |  19.18 |      23.34 |
| JSON 表示                          |     19.37 |  20.91 |  18.24 |      22.91 |
| 32表の生成・出力                   |     23.65 |  24.57 |  26.39 |      28.41 |
| 2,000進捗・最終結果のみ            |     23.74 |  24.53 |  28.85 |      30.16 |
| 20,000進捗・全 event 出力          |     44.09 |  46.45 |  73.86 |      52.09 |
| 4プロセス×20,000進捗・最終結果のみ |     46.37 |  53.65 | 274.03 |     188.33 |
| PTY フォーム・日本語入力           |     45.42 |  47.98 |  34.63 |      26.05 |

32表は各20行×4列、日本語を含む61,147 bytesの入力、stderr は63,360 bytes。pipe への生成・転送時間であり、端末画面の描画時間ではない。stream は100 task を開始し、進捗後に全 task と run を完了する。最終応答は1 runあたり124 bytes、全 event 出力は2,984,149 bytes。4プロセスの wall time は全終了まで、CPU と maxRSS は各子の合計で、peak の合計を同時点のメモリ使用量と扱わない。

PTY は80列×24行、`TERM=xterm-256color`、色なし。質問を受け取ると `日本語` と Enter を送る。起動から質問までは中央値42.95 ms・p95 45.31 ms、入力送信から成功 JSON までは中央値1.900 ms・p95 2.028 ms、PTY 出力は330 bytes。人の思考時間、各キーの描画、IME、実画面の遅延は含まない。

cold start、Linux の製品性能、30秒待機 CPU、実業務の JSON 生成・転送を含む追加時間、定常 RSS・長時間反復・PSS・footprint、実端末の描画は未測定であり、数値保証を設けない。[性能予算](design.md#性能予算)の全達成を示す結果ではない。

## 同梱部品と許諾の確認

同梱ランタイムは Bun 1.4.2、revision `744846f844374847c902b5e7fd59b4342a51ef99`。2026-09-17の固定ソース・OSV 照会・結果・確認時刻を[根拠データ](research/runtime-review.json)に保存している。確認先は [Bun advisory](https://github.com/oven-sh/bun/security/advisories)、[1.4.2 のリリース情報](https://bun.com/blog/bun-v1.4.2)、[OSV API](https://google.github.io/osv.dev/api/#osv-api)、[固定 revision の notices](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/LICENSE.md)。再リンク方法は[配布手順](distribution.md#配布物と在庫情報)に定める。

| 確認             | 結果と範囲                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| npm 依存         | `bun audit` が46パッケージを検査し、既知の脆弱性を検出しなかった                                    |
| Bun の公開情報   | 確認時点で公開 advisory は0件。1.4.2 の修正内容を確認した                                           |
| native 依存      | 固定ソースの21 commit と Brotli 1.1.0 を OSV で照合し、22照会すべて該当項目は0件                    |
| notices          | 固定した上流の `LICENSE.md` と保存済みの通知が byte 一致。配布工程でも hash を検証                  |
| SBOM・許諾の範囲 | Bun 内部は集約した一部品。native 全部品の許諾本文の完全な集約や、上流 WebKit 全体の再ビルドは未検証 |

native 依存の一覧は上流ソースの定義であり、Windows 限定の定義も含む。配布 binary の全構成を確定した一覧ではない。SQLite・ICU などの vendor データや WebKit 側の依存は[同じ Bun revision](https://github.com/oven-sh/bun/tree/744846f844374847c902b5e7fd59b4342a51ef99)と根拠データ内の固定ソースから追跡する。

照会結果が0件であることは安全性の証明ではない。OSV の収録範囲、fork、vendor 部品、OS 提供ライブラリ、polyfill、未公表の問題は照合だけで判定できない。署名付き SBOM も在庫の網羅性を保証しない。確認結果は固定 revision と確認日に対する記録として扱い、依存更新時と公開前に再評価する。
