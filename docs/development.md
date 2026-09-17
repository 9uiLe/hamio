# hamio 開発手順

hamio の編集、検査、ビルドは固定した Nix 環境で行う。エディタ、Git hooks、GitHub Actions は同じリポジトリ設定を使い、ローカルでも変更の問題を検出する。本書のコマンドは、特記がなければ hamio のリポジトリ直下で実行する。

製品の責務は[基本設計](design.md)、利用側との形式は [API 契約](api.md)、コードの依存方向は[実装設計](implementation.md)、導入と公開は[配布手順](distribution.md)に定める。

## 1. 対応環境とツール

| 開発環境 | CPU           | Nix system       |
| -------- | ------------- | ---------------- |
| macOS    | Apple Silicon | `aarch64-darwin` |
| Linux    | ARM64         | `aarch64-linux`  |
| Linux    | x86_64        | `x86_64-linux`   |

開発 shell の対応と、配布実行ファイルの対応は別に評価する。製品は macOS 15 と Ubuntu 24.04 の対象 CPU で試験する。Intel Mac の shell は固定 Nixpkgs の[プラットフォーム方針](https://nixos.org/manual/nixpkgs/unstable/release-notes#x86_64-darwin-26.11)に従い提供しない。

| 定義                       | 管理するもの                                                      |
| -------------------------- | ----------------------------------------------------------------- |
| `flake.nix`・`flake.lock`  | Bun、Node.js、Git、nixfmt、ShellCheck、shfmt、actionlint          |
| `package.json`・`bun.lock` | TypeScript、Biome、Prettier、Husky、lint-staged、型定義、製品依存 |
| Nix の preview shell       | agg、Python / Pillow、JetBrains Mono、Noto Sans CJK               |

`devShells.default` は日常開発、`devShells.preview` は画像生成用とする。Bun・Node.js をホストへ別途導入する必要はない。同梱用 Bun は版と hash を固定した公式アーカイブから展開し、Nix 向け loader 修正を加えずに使う。

## 2. 初回セットアップ

`nix-command` と `flakes` が有効な Nix を用意する。[Determinate Nix の導入手順](https://docs.determinate.systems/getting-started/)を参照できる。clone ごとに次を実行する。

```sh
./scripts/dev.sh bun run setup
./scripts/dev.sh bun run check
```

setup は `bun install --frozen-lockfile --ignore-scripts` による依存取得と、Git hooks の導入を行う。lockfile と依存宣言の不一致は失敗とし、依存の lifecycle scripts は実行しない。既存の `core.hooksPath` が `.husky/_` 以外なら上書きせず、開発者が既存 hooks との統合を行う。

`nix develop` は shell を開くだけで、依存取得や Git 設定変更は行わない。Nix store に不足するツールの取得には通信と空き容量を使う。binary cache は `cache.nixos.org` を基準とし、リポジトリから追加の cache・署名鍵を登録せず、署名検証を有効に保つ。

## 3. 日常の開発と検査

### 実行とビルド

```sh
nix develop
bun run hamio --help
bun run build
./dist/hamio capabilities
sh examples/form.sh
```

`bun run hamio` は TypeScript のソース、`dist/hamio` はホスト向けの同梱実行ファイルを実行する。Python の接続例は利用側の Python で `python3 examples/form.py` を実行する。

| コマンド                  | 用途と出力                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| `bun run build`           | 指定した同梱用 Bun で `dist/hamio` を生成                                                |
| `bun run package`         | ビルドと圧縮を行い `dist/hamio.gz` を生成                                                |
| `bun run release:package` | 独立した作業領域で依存取得・ビルド・梱包し、`dist/release/` に保存                       |
| `bun run release:verify`  | 二候補を比較し、展開後の実行試験に合格した資産と `dist/release-verification.json` を保存 |

試験と配布候補の生成は専用の一時領域を使い、共有の `dist/hamio` を読み書きしない。圧縮は梱包工程で行う。ローカルの配布コマンドは GitHub への公開・証明発行を行わない。

### 編集から完了まで

型診断と対象テストを確認しながら編集する。format や Lint の自動修正は明示的に実行し、差分を確認する。UI またはプレビュー生成元を変更したら画像を生成して開き、完了前に全体検査を通す。

```sh
bun run format
# UI またはプレビューの生成元を変更した場合
bun run preview
bun run check
```

| コマンド                                | 検査・操作                                             |
| --------------------------------------- | ------------------------------------------------------ |
| `bun run lint` / `lint:fix`             | Lint 検査 / Biome が安全と分類する修正                 |
| `bun run format` / `format:check`       | format の適用 / 読み取り専用の照合                     |
| `bun run typecheck` / `typecheck:watch` | strict 型検査 / 変更監視                               |
| `bun run test` / `test:watch`           | テスト / 変更監視                                      |
| `bun run check:staged`                  | ステージ済みファイルの検査                             |
| `bun run preview` / `preview:check`     | PNG の生成・再利用 / 生成元と画像の照合                |
| `bun run check`                         | Lint、format、型検査、テスト、プレビュー照合を順に実行 |

shell 外では `./scripts/dev.sh bun run check` の形式で固定環境を呼び出す。引数なしの `./scripts/dev.sh` も全体検査を行う。hooks もこの入口を使うため、GUI の PATH に Bun・Node.js がなくても Nix があれば実行できる。

全体検査と hooks は自動修正せず、最初の失敗で停止する。修正して差分を確認し、再検査する。検査を通すためにルール、型検査、hooks を無効化しない。

### エディタとファイル種別

VS Code の設定と推奨拡張は `.vscode/` に置く。Biome と Prettier が保存時 format を、[TypeScript 7 拡張](https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.native-preview)が `node_modules/typescript` を使った診断を担当する。拡張は開発者が導入し、他のエディタでも同じ固定ツールを使う。

| 対象           | 検査                                                     |
| -------------- | -------------------------------------------------------- |
| TS・JS・JSON   | Biome。TS は宣言ファイルを含む型検査                     |
| Markdown・YAML | Prettier。workflow は actionlint。文章・リンクはレビュー |
| Nix            | nixfmt と定義評価                                        |
| Shell・hooks   | ShellCheck と shfmt                                      |
| プレビュー     | 生成元・画像の照合と目視。manifest は Biome              |

設定は [package.json](../package.json)、[.lintstagedrc.json](../.lintstagedrc.json)、[tsconfig.json](../tsconfig.json)、[biome.json](../biome.json)を参照する。Nix の変更では全 system の定義を評価する。

```sh
nix flake check --all-systems --no-build --no-write-lock-file
```

この評価は各 OS での実行試験を代替しない。

### 製品試験と性能測定

通常の `bun test` は API、CLI、PTY、同梱実行ファイル、配布の失敗処理、独立ビルド、開発基盤を検証する。`HAMIO_TEST_BINARY` を指定した API・実行ファイル試験は、渡された binary を再生成せずに使う。`release:verify` は二回の独立した依存取得・梱包と、gzip から展開した実行ファイルを検査する。[検証の構成](implementation.md#10-検証の構成)

性能は本番と同じ設定の実行ファイルで測る。TypeScript の開発実行、画像生成の時間、製品の応答は別の測定とする。

```sh
bun run build
bun scripts/benchmark-api.ts dist/benchmarks/api.json 30
```

二版の比較では基準 commit を別ディレクトリでビルドし、実行ファイルを `dist/refactor/baseline-hamio` に保存する。Nix、ランタイム、ビルド設定を揃え、依存差分は lockfile とともに記録する。`BASELINE_COMMIT_SHA` は基準版の完全な commit SHA に置き換える。

```sh
bun run build
bun scripts/benchmark-refactor.ts dist/refactor/comparison.json dist/refactor/baseline-hamio dist/hamio 30 BASELINE_COMMIT_SHA
bun scripts/benchmark-progress.ts dist/refactor/progress.json dist/refactor/baseline-hamio dist/hamio 5
```

実行基盤の比較は各条件・各版2回 warmup し、30組で実行順を交代する。同じ出力契約を持つ版を使い、測定中のソース・binary の変更や pipe 出力の不一致を失敗とする。進捗の比較は PTY に150 ms間隔で同じ状態を10回送り、各版1回 warmup 後、5組で順序を交代する。送り手の待機を含む経過時間は描画遅延として扱わない。

測定中は別の benchmark、build、test を実行しない。入力・ソース・生成物の hash、OS、CPU、RAM、Bun、端末、測定 API、単位、全サンプル、中央値、p95、改善と悪化を残す。通常の検査・hooks・CI は benchmark を実行しない。[API 評価](research/api-performance.md)、[実行基盤の比較](research/refactor-performance.md)、[配布基盤と実行経路の評価](research/reproducibility-performance.md)を記録例とする。

## 4. Git hooks

Husky が hook を起動し、lint-staged がステージ済みファイルへ種別ごとの検査を適用する。

| hook       | 対象と動作                                                    |
| ---------- | ------------------------------------------------------------- |
| pre-commit | 部分ステージの未ステージ部分を退避・復元し、同時タスク2で検査 |
| pre-push   | 作業ツリー全体へ `bun run check` を実行                       |

失敗時は差分を修正して再ステージする。pre-push には未コミットの内容も含まれるため、送信 commit や PR のマージ候補と検査対象が一致するとは限らない。マージ候補の確認は Quality workflow が担当する。

hooks 自体は一時 Git リポジトリで正常系、不正な commit・push の拒否、部分ステージの復元、既存設定の保護を試験する。必須のマージ条件は、ローカル hooks とは別に GitHub の ruleset で管理する。

## 5. GitHub Actions

| workflow                                               | 起動条件                                                                                         | 環境と役割                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| [Quality](../.github/workflows/quality.yml) の PR 検査 | 所有者または Dependabot による同一リポジトリの `master` 向け PR。opened / synchronize / reopened | Ubuntu 24.04 の1ジョブで共通検査                                            |
| Quality の手動検査                                     | 所有者が ref と runner を選ぶ `workflow_dispatch`                                                | Ubuntu 24.04 または macOS 15                                                |
| [Release](../.github/workflows/release.yml)            | 所有者が ref と mode を選ぶ `workflow_dispatch`                                                  | macOS arm64、Linux x64/arm64 の候補検証。公開は版タグ・明示指定・承認が必要 |

branch push、PR close、タグ push は起動条件に含めない。通常の PR は共通検査を一度実行し、対象環境ごとの配布検証は Release workflow で行う。

### PR の検査と権限

Quality は checkout、Nix 導入、全 system の Nix 定義評価、固定依存の取得、`bun run check`、`git diff --exit-code` を順に行う。文書のみの PR も検査する。プレビューは保存済み PNG と生成元を照合する。

Actions は完全な commit SHA で固定する。Quality の token は `contents: read`、checkout は認証情報を保持しない。`pull_request_target` は使わず、外部 fork の PR では workflow を実行しない。CI は hooks を導入せず、検査コマンドを直接呼ぶ。

同じ event・ref・runner の古い Quality 実行をキャンセルする。PR と手動検査、異なる OS は別の実行として扱う。上限は20分。`quality` の成功をマージの必須条件とする。[CI の構成と測定](research/ci.md)

### リポジトリの保護設定

ruleset はブランチ・タグへの更新条件、Environment は公開 job の承認条件を管理する GitHub の設定である。

| 対象                  | 設定                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `master`              | PR 必須、GitHub Actions の `quality` 成功、最新 base との整合、レビュー会話の解決。force push・削除は禁止。bypass なし |
| `v*` タグ作成         | 管理者のみ。管理者は所有者1名                                                                                          |
| `v*` タグ更新・削除   | 作成制限とは別 ruleset で禁止。管理者も bypass しない                                                                  |
| `release` Environment | 所有者の承認、`v*` タグのみ。管理者 bypass は無効、自己承認は許可                                                      |
| Actions               | 既定 token は読み取り専用。PR 承認は許可せず、job ごとに必要な権限だけ付与                                             |
| 投稿                  | collaborator のみに制限。期限を確認して更新                                                                            |
| 脆弱性対応            | 非公開報告、Dependabot alerts・security updates、secret scanning・push protection を有効化                             |

単独保守のため PR の他者承認数は0とする。所有者にも PR と必須検査を適用する。Dependabot は更新 PR と読み取り専用検査を使い、自動マージや公開権限を持たない。公開リポジトリの閲覧・clone・fork は制限しない。

設定は GitHub 上で管理され、リポジトリ内のファイルだけでは復元されない。保守者の追加、job 名の変更、公開前には次の情報と設定表を照合する。投稿制限は期限も確認し、必要に応じて更新する。

```sh
gh api repos/9uiLe/hamio/rulesets
gh api repos/9uiLe/hamio/environments/release
gh api repos/9uiLe/hamio/interaction-limits
```

### OS ごとの確認

Bun、Nix、hooks、OS 依存ライブラリ、端末 I/O、プロセス管理、同梱実行ファイルを変更した場合は Linux と macOS で試験する。PR の Linux 検査に、対象ブランチの macOS 検査を併用する。

```sh
# YOUR_BRANCH を検証対象のブランチに置換する。
gh workflow run quality.yml --ref YOUR_BRANCH -f runner=macos-15
```

Linux の手動検査は `runner=ubuntu-24.04` を指定する。手動検査の commit は PR のマージ候補と異なる場合があるため、結果に対象を記録する。Linux ARM64 を含む配布物の検証は[Release の候補検証](distribution.md#候補の検証と公開の操作)を使う。

## 6. 開発用スキル

AI エージェントは [AGENTS.md](../AGENTS.md)を入口とし、担当領域に必要なスキルを読む。

| スキル                                                                    | 対象                                               |
| ------------------------------------------------------------------------- | -------------------------------------------------- |
| [hamio-software-design](../.agents/skills/hamio-software-design/SKILL.md) | 入出力、状態遷移、モジュール境界、業務と UI の責務 |
| [hamio-typescript](../.agents/skills/hamio-typescript/SKILL.md)           | 外部入力、状態の型、非同期処理、strict 設定        |
| [hamio-performance](../.agents/skills/hamio-performance/SKILL.md)         | 起動、CPU、メモリ、event 量、並列性、測定条件      |

スキルの判断基準と機械的な検査を併用する。スキルは製品実装、外部投稿、公開などの作業範囲を広げる権限ではない。

## 7. 依存とツールの更新

Dependabot は Bun ecosystem の依存、GitHub Actions、Nix の更新を週次に提案する。security updates も PR として検査し、所有者が取得元、差分、lifecycle scripts、lockfile を確認する。自動マージと通常実行時の `bunx` などによる取得は行わない。

Bun の更新では Nix 入力、同梱ランタイム、`packageManager`、`engines`、型定義、配布 metadata と notices を揃える。Node.js は開発ツールの要求版を使う。`@types/node` は Bun の宣言が参照する依存として `overrides` で固定し、宣言ファイルも検査する。型定義の版を実行時 API の保証とはみなさない。

```sh
bun install --frozen-lockfile --ignore-scripts
nix flake check --all-systems --no-build --no-write-lock-file
bun audit
bun run format
bun run preview
bun run check
```

`bun audit` は npm 依存を検査する。同梱 Bun と native 部品の advisory、許諾、ソース提供条件は別途確認し、対象 revision と根拠を[リリース評価](release-readiness.md)から参照できる形で残す。UI・ランタイムの変更では端末、性能、在庫、配布物を再評価し、ランタイムの修正は新しい製品版で利用側へ届ける。[セキュリティ方針](../SECURITY.md)

## 8. ターミナル UI のプレビュー

PTY の実際の出力を記録し、静止画 PNG と操作過程の GIF で確認する。

| シナリオ  | 実行対象                         | 端末サイズ | 確認範囲                                   |
| --------- | -------------------------------- | ---------- | ------------------------------------------ |
| `product` | 製品 CLI の form・stream・render | 80列・28行 | 選択、確認、進捗、秘密の非表示、結果表     |
| `fixture` | 録画基盤の検証用プログラム       | 80列・20行 | 日本語、色、入力、カーソル更新の記録・描画 |

### 生成と再利用

```sh
./scripts/preview.sh
./scripts/preview.sh --recording
```

既定は PNG、`--recording` は PNG とローカルの GIF・cast を対象とする。生成元と成果物を照合し、不足・変更・破損があれば生成する。`--force` は強制生成、`bun run preview:check` は読み取り専用の照合を行う。

日常の Nix shell 内では、画像が最新なら描画ツールを取得しない。生成が必要な場合に preview shell を使う。shell 外の実行はその準備も含むため、繰り返し生成する場合は `nix develop .#preview` 内で `bun run preview` を使う。

cast は出力と時刻を記録する asciicast、manifest は生成元・成果物の hash を記録する JSON である。

| 成果物                         | 制限と保存                                         |
| ------------------------------ | -------------------------------------------------- |
| `docs/previews/*.png`          | 1枚512 KiB以下。ソースと同じ commit に含める       |
| `docs/previews/manifest.json`  | PNG の生成元・画像 hash・環境。PNG と同時に commit |
| `dist/preview/*.cast`・`*.gif` | 各16 MiB以下。ローカル専用                         |
| `dist/preview/manifest.json`   | 録画と生成元の hash。ローカル専用                  |

生成元は `scripts/preview/**/*.ts`、`scripts/preview*.sh`、`src/**/*`、`examples/**/*.json`、`flake.nix`、`flake.lock`、`package.json`、`bun.lock` とする。内容だけでなく追加・削除も照合する。PNG と録画の生成元が異なる場合は `--recording` で録画を生成する。CI はローカル録画を要求しない。

### 目視確認と共有

PNG を画像として開き、日本語、余白、折り返し、色、カーソル更新の残骸を確認する。入力・状態遷移の変更では GIF の操作途中も確認し、ソース、PNG、manifest を一緒にステージする。[プレビュー一覧](previews/README.md)

PR は[テンプレート](../.github/pull_request_template.md)に従い、対象 commit に固定した画像を埋め込む。`COMMIT_SHA` を commit・push 後の `git rev-parse HEAD` の完全な SHA に置換する。

```md
![入力画面](https://raw.githubusercontent.com/9uiLe/hamio/COMMIT_SHA/docs/previews/product-input.png)
![結果画面](https://raw.githubusercontent.com/9uiLe/hamio/COMMIT_SHA/docs/previews/product-result.png)
```

PR 更新時は画像リンクも更新し、シナリオ、確認した状態、未確認の OS・端末を説明する。チャットでは確認済み PNG をローカル絶対パスでインライン表示する。GIF の公開は内容確認後に手動で行い、外部録画サービスへの自動送信や cast 全文の転記は行わない。

### シナリオと実行の制限

[scenarios.ts](../scripts/preview/scenarios.ts) はコマンド、端末サイズ、期待出力、送信キー、撮影位置を定義する。期待出力を待ってから入力し、外部入力ファイルも生成元へ含める。

| モジュール                                      | 責務                               |
| ----------------------------------------------- | ---------------------------------- |
| [generate.ts](../scripts/preview/generate.ts)   | 引数、再利用・生成の選択、出力先   |
| [artifacts.ts](../scripts/preview/artifacts.ts) | 内容照合、サイズ・形式の検証、診断 |
| [capture.ts](../scripts/preview/capture.ts)     | PTY、出力記録、撮影位置、終了判定  |
| [render.ts](../scripts/preview/render.ts)       | 画像化、生成前後の入力源検証、保存 |
| [preview-env.sh](../scripts/preview-env.sh)     | preview shell の準備               |

Bun の PTY が stdout・stderr を記録し、agg が端末命令を描画する。一つのシナリオにつき一つの cast を保持し、撮影位置を event 番号で指定する。PNG は一つの Pillow プロセスで変換する。GIF には閲覧用の入力前待機500 msを設け、PNG には使わない。

キャプチャと描画は順次実行する。既定上限はキャプチャ15秒、出力1 MiB、10,000 event、描画コマンド60秒。agg の Rayon スレッドプールは2、GIF は10 fpsとする。これは録画基盤の制限であり、製品の性能予算ではない。

異常終了、不足画面、上限超過、timeout、生成中の入力源変更は失敗とする。ダミーデータ、固定端末・locale、一時 HOME、限定 PATH を使い、`.env` と依存自動取得を無効にする。未信頼コードを隔離する sandbox としては使わない。内容照合、目視、実端末、画面読み上げ、製品性能は別々に評価する。[プレビューの性能記録](research/preview-performance.md)

## 参照資料

- 検査: [Biome](https://biomejs.dev/guides/getting-started/)、[Prettier](https://prettier.io/docs/cli)、[Husky](https://typicode.github.io/husky/)、[lint-staged](https://github.com/lint-staged/lint-staged)、[Bun install](https://bun.com/docs/pm/cli/install)。
- 端末記録: [Bun PTY](https://bun.com/docs/runtime/child-process#terminal-pty-support)、[asciicast v2](https://docs.asciinema.org/manual/asciicast/v2/)、[agg](https://docs.asciinema.org/manual/agg/usage/)。
