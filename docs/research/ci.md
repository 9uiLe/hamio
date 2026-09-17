# CI の構成と測定

hamio の CI は、PR のマージ候補に対して製品と開発基盤の品質検査を行う。通常の PR は Linux の1ジョブとし、macOS は関連変更時に手動で検証する。本書は検査範囲と、対象 commit を固定した実行時間の判断根拠を記録する。操作方法は[開発手順](../development.md)、製品の性能測定は[製品 API の性能評価](api-performance.md)を参照する。

## 検証範囲

| 検査                               | 実行方針                                              | 判断理由                                                          |
| ---------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- |
| Lint・format・型検査               | PR の Linux ジョブ                                    | 同じ設定と入力の静的検査を各 OS で重複させない                    |
| 開発基盤の実行テスト               | Linux は各 PR、macOS は関連変更時に手動実行           | hooks、ファイル、子プロセスの OS 差を対象環境で確認する           |
| Nix 定義                           | 全 system を評価                                      | 定義の不整合を調べる。OS 上の起動・動作試験は別に行う             |
| プレビュー                         | PR では生成元と PNG の hash を照合                    | 描画ツールを通常の検査へ持ち込まず、更新漏れを検出する            |
| 製品の端末・プロセス・実行ファイル | Linux は各 PR、macOS は関連変更時に同じ試験を手動実行 | 入力モード、シグナル、同梱 UI、暗黙設定の抑制を対象 OS で確認する |

Bun・Nix・hooks・OS に関わる依存の変更では、マージ前に macOS の検証を行う。通常の PR が成功しても macOS の動作確認を完了したとは扱わない。手動実行は選択ブランチの commit を検証するため、PR のマージ候補とは異なる場合がある。[GitHub: manual workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)

## 起動条件と実行構成

自動トリガーは `master` 向け `pull_request` の `opened`、`synchronize`、`reopened` とする。push と PR close は含めない。PR でマージ候補を検証する運用とし、直接 push した commit の自動検査は行わない。merge queue を導入する場合は `merge_group` 用の検査を設計する。[GitHub: workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)

Markdown も format の対象なので、文書だけの PR も実行する。パス分類のための別ジョブは設けず、`quality` の1ジョブに検査をまとめる。

依存取得と全体検査は一度の `nix develop` 内で順次実行する。固定 lockfile、lifecycle scripts の抑制、Actions の SHA 固定、所有者限定の実行条件を適用する。画像の生成は専用コマンドで行い、通常の CI から切り離す。

## 測定条件

測定日は2026-09-17。以下の構成と commit を対象とする。いずれも端末プレビュー機能を含まない開発基盤の検査であり、プレビューの追加コストや製品性能の測定には使用しない。

| 構成          | 対象                                                            | 実行記録                                                             |
| ------------- | --------------------------------------------------------------- | -------------------------------------------------------------------- |
| 2 OS・PR/push | commit `6ad8a397949597a31f47a33b2581085f6a2de6b8` の PR         | [PR 検査](https://github.com/9uiLe/hamio/actions/runs/35165959109)   |
| 2 OS・PR/push | merge commit `6ebc280a87bac12339869f0baa9897ba90dd1cd0` の push | [push 検査](https://github.com/9uiLe/hamio/actions/runs/35166207216) |
| Linux・PR     | commit `8bb3dc2cfaeddf82ed2bf7c66c8a8445ddbf3008` の PR         | [PR 検査](https://github.com/9uiLe/hamio/actions/runs/35167221540)   |

ジョブと step の秒数は GitHub Jobs API の `started_at` と `completed_at` の差を用いる。ジョブ時間は queue 待ちを除き、準備・検査・後処理を含む。workflow 全体時間は作成から完了までとする。コマンド単体の時間は実行ログを用いる。少数の観測値であり、平均値や性能保証ではない。

### 2 OS・PR/push 構成

| 実行 | runner         | ジョブ全体 | Nix 導入 | Nix 定義評価 | 環境準備・依存取得 | 全体検査の step |
| ---- | -------------- | ---------- | -------- | ------------ | ------------------ | --------------- |
| PR   | `ubuntu-24.04` | 53秒       | 16秒     | 14秒         | 11秒               | 4秒             |
| PR   | `macos-15`     | 150秒      | 70秒     | 26秒         | 33秒               | 8秒             |
| push | `ubuntu-24.04` | 53秒       | 13秒     | 18秒         | 10秒               | 5秒             |
| push | `macos-15`     | 108秒      | 54秒     | 14秒         | 22秒               | 7秒             |

PR の workflow 全体は159秒。PR と merge 後の push の4ジョブを合わせた経過時間は364秒である。この合計は workflow の待ち時間や課金額とは異なる。

PR の `bun install` は Linux 349 ms、macOS 630 ms、hooks テストはそれぞれ1.59秒、3.38秒だった。検査本体より Nix 導入と環境準備が長く、複数ジョブへの分割ではこの準備が重複する。

### Linux・PR 構成

| 項目                        | 時間 |
| --------------------------- | ---- |
| workflow 作成から完了       | 56秒 |
| workflow 作成からジョブ開始 | 2秒  |
| Linux ジョブ全体            | 53秒 |
| Nix 導入                    | 11秒 |
| Nix 定義評価                | 24秒 |
| 依存取得と全体検査          | 14秒 |
| post 処理                   | 1秒  |

Linux ジョブの時間は両構成とも53秒だった。workflow 全体の観測差は103秒であり、Linux・PR 構成では通常の検査完了が macOS ジョブに依存しない。Nix shell の統合だけによる高速化を、この比較から独立して証明することはできない。

手動の macOS 検証を行う場合は、その時間と資源消費を別に加算する。自動ジョブの削減と OS 固有の検証範囲を合わせて評価する。

## キャッシュと並列化の判断

JS 依存取得は観測時点で1秒未満のため、Bun のキャッシュ処理は導入しない。Nix キャッシュは復元、保存、post 処理を含む総時間と信頼範囲を評価して採否を決める。cache hit だけで準備時間の短縮を判断しない。[GitHub: dependency caching](https://docs.github.com/en/actions/concepts/workflows-and-actions/dependency-caching)

検査本体が数秒の構成では、ジョブを分ける並列化より環境準備の共有を優先する。検査対象や依存を変更した場合は、workflow 全体、queue 待ち、Nix 導入、定義評価、依存取得、検査、後処理を同じ条件で記録する。製品の実行テストや画像生成の時間は、静的検査の時間と区別して評価する。
