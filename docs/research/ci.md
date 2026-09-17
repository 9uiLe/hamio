# CI の測定と検証範囲

hamio の品質検査は、静的解析・format・型検査と、開発基盤の実行テストを扱う。本書は GitHub Actions の実行時間と検証範囲を評価する資料である。製品の性能測定は[性能特性と測定](performance.md)、開発者の操作は[開発手順](../development.md)に定める。

## 測定対象

調査日は 2026-09-17。対象は開発基盤の commit `6ad8a397949597a31f47a33b2581085f6a2de6b8` に対する [PR 検査](https://github.com/9uiLe/hamio/actions/runs/35165959109)と、merge commit `6ebc280a87bac12339869f0baa9897ba90dd1cd0` に対する [push 検査](https://github.com/9uiLe/hamio/actions/runs/35166207216)である。どちらも macOS と Linux の matrix で全体検査を実行している。

秒単位の時間は GitHub の Jobs API にある `started_at` と `completed_at` の差を使う。ジョブ時間は queue 待ちを除き、準備・検査・後処理を含む。依存取得コマンド単体の時間は実行ログを用いる。2回の実行を観測した値であり、平均値や性能保証ではない。

| 実行 | runner         | ジョブ全体 | Nix 導入 | Nix 定義評価 | 開発環境の準備と依存取得 | 全体検査の step |
| ---- | -------------- | ---------- | -------- | ------------ | ------------------------ | --------------- |
| PR   | `ubuntu-24.04` | 53秒       | 16秒     | 14秒         | 11秒                     | 4秒             |
| PR   | `macos-15`     | 150秒      | 70秒     | 26秒         | 33秒                     | 8秒             |
| push | `ubuntu-24.04` | 53秒       | 13秒     | 18秒         | 10秒                     | 5秒             |
| push | `macos-15`     | 108秒      | 54秒     | 14秒         | 22秒                     | 7秒             |

PR の全体所要時間は作成から完了まで159秒。PR とマージ後の push を合わせたジョブ時間は364秒である。これは経過時間の合計であり、課金額の計算ではない。

PR の `bun install` 自体は Linux 349 ms、macOS 630 ms、hooks テストはそれぞれ1.59秒、3.38秒だった。検査本体よりも Nix 導入と環境準備が長く、検査コマンドを複数ジョブへ分割すると準備が重複する。

## トリガー

自動検査は `master` 向けの `pull_request` に限定し、`opened`、`synchronize`、`reopened` を対象とする。PR の close と `master` への push はトリガーに含めない。マージ後の重複実行をなくす一方、直接 push した commit の自動検査も行わないため、変更は PR で確認する。

GitHub の `pull_request` はマージ候補を検証する。merge queue を導入する場合は `merge_group` を対象とする検査を別途設計する。[GitHub: workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)

Markdown も format の対象なので、文書のみの PR を workflow 全体から除外しない。変更パスの分類ジョブや追加 Actions による分岐は設けず、PR ごとに安定した `quality` チェックを返す。

## OS ごとの検証

| 検査                         | 実行方針                                    | 理由                                                                  |
| ---------------------------- | ------------------------------------------- | --------------------------------------------------------------------- |
| Lint・format・型検査         | PR の Linux ジョブで実行する                | 同じ設定・入力の静的検査を各 OS で重複させない                        |
| 開発基盤の実行テスト         | Linux は各 PR、macOS は関連変更時の手動実行 | hooks、ファイル、子プロセスの OS 差は静的検査だけでは確認できない     |
| Nix 定義                     | Linux から全 system を評価する              | 定義の不整合を調べる。対象 OS での起動・動作確認は別に行う            |
| 製品の端末・プロセス・配布物 | 製品実装時に両 OS の自動テストを設計する    | 入力モード、シグナル、native 部品、ランタイムの互換性は実機で検証する |

品質検査は1ジョブの共通定義とし、PR は Linux、手動実行は Linux / macOS のいずれかを選ぶ。Bun・Nix・hooks・OS に関わる依存の変更時は、マージ前に macOS でも検査する。通常の PR が成功しただけでは macOS の動作確認を完了したとは扱わない。手動実行は対象ブランチを選べるが、その commit と PR のマージ候補は同一とは限らない。[GitHub: manual workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)

## 準備時間とキャッシュ

依存取得と全体検査は一度の `nix develop` で連続して実行し、shell の再起動を減らす。Nix 定義の評価、固定 lockfile、lifecycle scripts の抑制、Actions の SHA 固定、所有者のみに限定した実行条件は維持する。

JS 依存の取得は観測時点で1秒未満なので、Bun のキャッシュは導入しない。Nix キャッシュは復元・保存・post 処理を含めた総時間と信頼範囲を評価してから導入する。取得済みの依存を再利用するキャッシュは準備時間を短縮し得るが、各ジョブのキャッシュ処理自体にも時間がかかる。[GitHub: dependency caching](https://docs.github.com/en/actions/concepts/workflows-and-actions/dependency-caching)

Lint・format・型検査・テストは同一ジョブ内で順に実行する。検査部分が数秒の段階では、独立ジョブの起動や環境準備を増やす並列化は行わない。

## 改善の評価

測定した実行からマージ後の push と PR の macOS ジョブを除くと、自動実行のジョブ数は4から1となり、同じ測定値を当てはめたジョブ時間は364秒から53秒になる。PR の待ち時間は macOS の150秒のジョブに支配されなくなる。これらは構成変更による削減見込みであり、変更後の実測値ではない。

次の PR では全体時間、queue 待ち、Nix 導入、定義評価、依存取得と検査、後処理を記録し、見込みと比較する。手動の macOS 検査を実行した分は別に加算する。通常の PR で短いフィードバックを得ることと、OS 固有の互換性を確認することの両方を評価する。
