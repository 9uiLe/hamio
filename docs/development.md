# hamio 開発手順

hamio の編集、検査、ビルドは固定した Nix 環境で行う。エディタ、Git hooks、GitHub Actions は同じリポジトリ設定を使い、ローカルでも変更の問題を検出する。本書のコマンドは、特記がなければ hamio のリポジトリ直下で実行する。

製品の責務と依存境界は[基本設計](design.md)、公開契約は [API 契約](api.md)、導入と公開は[配布手順](distribution.md)に定める。

## 1. 対応環境とツール

開発 shell は `aarch64-darwin`、`aarch64-linux`、`x86_64-linux` に対応する。配布実行ファイルの対応環境は[配布手順](distribution.md#配布方式と対象環境)で別に評価する。Intel Mac の shell は固定 Nixpkgs の[プラットフォーム方針](https://nixos.org/manual/nixpkgs/unstable/release-notes#x86_64-darwin-26.11)に従い提供しない。

日常開発は `devShells.default`、画像生成は `devShells.preview` を使う。Bun・Node.js をホストへ別途導入する必要はない。ツールは [flake.nix](../flake.nix)・`flake.lock`、JavaScript 依存は [package.json](../package.json)・`bun.lock` を正本とする。

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

`bun run package` はローカル実行ファイルを `dist/hamio.gz` に圧縮する。公開用の候補生成・検証には[配布コマンド](distribution.md#配布候補の生成と検証)を使う。試験と候補生成は専用の一時領域を使い、共有の `dist/hamio` を読み書きしない。

### 編集から完了まで

型診断と対象テストを確認しながら編集する。format や Lint の自動修正は明示的に実行し、差分を確認する。UI またはプレビュー生成元を変更したら画像を生成して開き、完了前に全体検査を通す。

```sh
bun run format
# UI またはプレビューの生成元を変更した場合
bun run preview
bun run check
```

`bun run check` は Lint、format、strict 型検査、テスト、プレビュー照合を順に実行する。個別検査や watch の入口は [package.json](../package.json) を参照する。

shell 外では `./scripts/dev.sh bun run check` の形式で固定環境を呼び出す。引数なしの `./scripts/dev.sh` も全体検査を行う。hooks もこの入口を使うため、GUI の PATH に Bun・Node.js がなくても Nix があれば実行できる。

全体検査と hooks は自動修正せず、最初の失敗で停止する。修正して差分を確認し、再検査する。検査を通すためにルール、型検査、hooks を無効化しない。

### エディタと Nix の検査

VS Code の保存時 format・型診断と推奨拡張は [.vscode/](../.vscode/) を参照する。拡張は開発者が導入し、他のエディタでも同じ固定ツールを使う。Markdown の文章・リンクは formatter では検証されないためレビューする。

設定は [package.json](../package.json)、[.lintstagedrc.json](../.lintstagedrc.json)、[tsconfig.json](../tsconfig.json)、[biome.json](../biome.json)を参照する。Nix の変更では全 system の定義を評価する。

```sh
nix flake check --all-systems --no-build --no-write-lock-file
```

この評価は各 OS での実行試験を代替しない。Nix パッケージの変更では、ホスト向けの生成と導入試験も行う。

```sh
nix flake check --no-write-lock-file --print-build-logs
nix run .#hamio -- --version
```

`nix build`・`nix run` は固定した公開版を対象とし、`bun run build` は作業中の製品ソースを対象とする。Nix の新規ファイルは Git にステージしてから評価する。Nix 定義と固定情報の更新は[配布手順](distribution.md#nix-パッケージの保守)に従う。

### 製品試験と性能測定

通常の `bun test` は API、CLI、PTY、実行ファイル、失敗処理、開発基盤を確認する。変更した境界に応じて次の検査を選ぶ。

| 入口                                                                                                       | 検査の範囲                                                                     |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [api.test.ts](../tests/api.test.ts)・[runtime.test.ts](../tests/runtime.test.ts)                           | 回答・終了・状態・上限・秘密、入出力の順序と資源解放、描画・背圧               |
| [executable.test.ts](../tests/executable.test.ts)                                                          | 実行ファイル、開発ランタイムのない PATH、暗黙設定、Shell・PTY                  |
| [distribution.test.ts](../tests/distribution.test.ts)・[nix-release.test.ts](../tests/nix-release.test.ts) | GitHub CLI の代替実装で検証条件、失敗時の非実行・保持、更新・復旧・lock を確認 |
| [release.test.ts](../tests/release.test.ts)                                                                | 別ルートのビルド、入力の固定、資産の配置・復元、公開条件                       |
| [hooks.test.ts](../tests/hooks.test.ts)・[preview.test.ts](../tests/preview.test.ts)                       | 検査の拒否・復元、録画・照合                                                   |
| `release:verify`                                                                                           | 独立した二回の依存取得・梱包、全資産の一致、gzip から展開した製品の試験        |
| Release workflow                                                                                           | 実際の provenance と候補の動作、公開後の署名・資産帰属・インストーラー・Action |
| `nix flake check`                                                                                          | 固定した公開資産の取得・hash、Nix 配置後の独立プロジェクトからの実行           |

`HAMIO_TEST_BINARY` を指定した API・実行ファイル試験は、渡された binary を再生成せずに使う。代替実装による試験を実際の署名検証の成功と扱わず、同一環境の二候補の一致を別ホストでの一致へ一般化しない。

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

測定中は別の benchmark、build、test を実行しない。入力・ソース・生成物の hash、OS、CPU、RAM、Bun、端末、測定 API、単位、全サンプル、中央値、p95、改善と悪化を残す。通常の検査・hooks・CI は benchmark を実行しない。比較対象のない現行版の実測値は[リリース評価](release-readiness.md#性能の実測範囲)にまとめる。

測定スクリプトの wall time は親の `performance.now()` で起動から終了・出力取得までを測る。子の [resourceUsage()](https://bun.com/reference/bun/Subprocess/resourceUsage) は CPU を microseconds から ms、maxRSS を bytes から MiB に換算する。親プロセスの負荷は含まない。複数プロセスの peak RSS の合計は同時点の使用量ではなく、RSS・PSS・macOS footprint・JS heap も交換できない。

warm な新規プロセスと cold start、通常実行と profiler・強制 GC を区別する。PTY 入力から成功 JSON までの時間は、各キーの画面描画や IME の遅延ではない。出力量は stdout と stderr の合計 bytes を残し、token を評価する場合は取得経路と tokenizer を特定する。[性能予算](design.md#性能予算)の業務負荷は、JSON 生成・転送・待機・補助プロセスも含めて hamio なし・ありを比較する。

## 4. Git hooks

Husky が hook を起動し、lint-staged がステージ済みファイルへ種別ごとの検査を適用する。

| hook       | 対象と動作                                                    |
| ---------- | ------------------------------------------------------------- |
| pre-commit | 部分ステージの未ステージ部分を退避・復元し、同時タスク2で検査 |
| pre-push   | 作業ツリー全体へ `bun run check` を実行                       |

失敗時は差分を修正して再ステージする。pre-push には未コミットの内容も含まれるため、送信 commit や PR のマージ候補と検査対象が一致するとは限らない。マージ候補の確認は Quality workflow が担当する。

必須のマージ条件は、ローカル hooks とは別に GitHub の ruleset で管理する。

## 5. GitHub Actions

| 確認したい変更                                     | 使う workflow                                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| すべての PR（文書を含む）                          | [Quality](../.github/workflows/quality.yml)。マージ候補を Ubuntu の1ジョブで検査                             |
| OS 依存の変更                                      | Quality を対象 ref・runner で手動実行。下記の OS ごとの確認に従う                                            |
| 配布候補・公開・公開物の導入                       | [Release](../.github/workflows/release.yml)。[配布手順](distribution.md#保守者のリリース工程)の3モードを使う |
| Nix パッケージの定義・lockfile・固定情報・導入試験 | [Nix package](../.github/workflows/nix.yml)。関連する PR と手動実行で3対象の取得・配置・実行を確認           |

通常の PR は共通検査を一度実行し、OS・CPU に依存する配布検証は明示的に選ぶ。Nix パッケージの関連変更だけは3対象の自動検査を追加する。CI の負荷を比較するときは検査本体だけでなく Nix の準備・cache 取得を含む総時間を見る。

Quality は所有者または Dependabot による同一リポジトリの `master` 向け PR と、所有者の手動実行に限る。branch push、PR close、タグ push では起動しない。外部 fork や `pull_request_target` で実行せず、token は読み取り専用、checkout に認証を残さず、Actions を完全な commit SHA で固定する。

Quality は全 system の Nix 定義評価、固定依存の取得、`bun run check`、追跡ファイルの差分確認を行う。CI では hooks を導入せず検査を直接呼び、`quality` 成功をマージの必須条件とする。手動実行の ref は PR のマージ候補と異なり得るため結果に対象 commit を残す。Nix の3対象も併用する手動実行は[配布手順](distribution.md#nix-パッケージの保守)を参照する。

### リポジトリの保護設定

ruleset はブランチ・タグへの更新条件、Environment は公開 job の承認条件を管理する GitHub の設定である。

| 対象                  | 設定                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `master`              | PR 必須、GitHub Actions の `quality` 成功、最新 base との整合、レビュー会話の解決。force push・削除は禁止。bypass なし |
| `v*` タグ作成         | 管理者のみ。管理者は所有者1名                                                                                          |
| `v*` タグ更新・削除   | 作成制限とは別 ruleset で禁止。管理者も bypass しない                                                                  |
| `release` Environment | 所有者の承認、`v*` タグのみ。管理者 bypass は無効、自己承認は許可                                                      |
| immutable releases    | 有効。所有者が公開承認前に確認し、公開後は実際の release attestation を検証                                            |
| Actions               | 既定 token は読み取り専用。PR 承認は許可せず、job ごとに必要な権限だけ付与                                             |
| 投稿                  | collaborator のみに制限。期限を確認して更新                                                                            |
| 脆弱性対応            | 非公開報告、Dependabot alerts・security updates、secret scanning・push protection を有効化                             |

単独保守のため PR の他者承認数は0とする。所有者にも PR と必須検査を適用する。Dependabot は更新 PR と読み取り専用検査を使い、自動マージや公開権限を持たない。公開リポジトリの閲覧・clone・fork は制限しない。

設定は GitHub 上で管理され、リポジトリ内のファイルだけでは復元されない。保守者の追加、job 名の変更、公開前には次の情報と設定表を照合する。投稿制限は期限も確認し、必要に応じて更新する。

```sh
gh api repos/9uiLe/hamio/rulesets
gh api repos/9uiLe/hamio/environments/release
gh api repos/9uiLe/hamio/immutable-releases --jq .enabled
gh api repos/9uiLe/hamio/interaction-limits
```

管理設定の照会は所有者の認証で行う。Release job の `GITHUB_TOKEN` に管理権限を持たせず、公開承認前の設定確認と、公開後の資産検証をそれぞれの権限で行う。

### OS ごとの確認

Bun、Nix、hooks、OS 依存ライブラリ、端末 I/O、プロセス管理、同梱実行ファイルを変更した場合は Linux と macOS で試験する。PR の Linux 検査に、対象ブランチの macOS 検査を併用する。

```sh
# YOUR_BRANCH を検証対象のブランチに置換する。
gh workflow run quality.yml --ref YOUR_BRANCH -f runner=macos-15
```

Linux の手動検査は `runner=ubuntu-24.04` を指定する。手動検査の commit は PR のマージ候補と異なる場合があるため、結果に対象を記録する。Linux ARM64 を含む配布物の検証は[Release の候補検証](distribution.md#候補の検証と公開の操作)を使う。

## 6. 開発用スキル

AI エージェントの作業規則と領域別スキルの選択は [AGENTS.md](../AGENTS.md) に従う。

## 7. 依存とツールの更新

[Dependabot の設定](../.github/dependabot.yml)に従う更新と security updates は PR で検査し、所有者が取得元、差分、lifecycle scripts、lockfile を確認する。自動マージと通常実行時の `bunx` などによる取得は行わない。

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

`docs/previews/*.png` と `manifest.json` はソースと同じ commit に含める。`dist/preview/` の GIF・cast（端末出力と時刻）と録画用 manifest はローカル専用で、CI は要求しない。PNG と録画の生成元が異なる場合は `--recording` で更新する。

### 目視確認と共有

PNG を画像として開き、日本語、余白、折り返し、色、カーソル更新の残骸を確認する。入力・状態遷移の変更では GIF の操作途中も確認し、ソース、PNG、manifest を一緒にステージする。[プレビュー一覧](previews/README.md)

PR は[テンプレート](../.github/pull_request_template.md)に従い、commit・push 後の完全な SHA に固定した画像を埋め込む。PR 更新時はリンクも更新し、シナリオ、確認した状態、未確認の OS・端末を説明する。チャットでは確認済み PNG をローカル絶対パスでインライン表示する。GIF の公開は内容確認後に手動で行い、外部録画サービスへの自動送信や cast 全文の転記は行わない。

### シナリオと実行の制限

[scenarios.ts](../scripts/preview/scenarios.ts)でコマンド、端末サイズ、期待出力、送信キー、撮影位置を定義する。期待出力を待ってから入力し、外部入力ファイルも生成元へ含める。実際の製品出力を記録し、製品の確認と録画基盤の fixture を区別する。

異常終了、不足画面、上限超過、timeout、生成中の入力源変更は失敗とする。ダミーデータ、固定端末・locale、一時 HOME、限定 PATH を使うが、未信頼コードを隔離する sandbox ではない。内容照合と目視だけで各 OS の実端末、画面読み上げ、製品性能を確認したとは扱わない。

プレビュー基盤の性能を調べる場合は preview shell 内で次を使う。

```sh
nix develop .#preview
bun scripts/benchmark-preview.ts dist/preview/benchmark.json 15
```

この測定は強制生成を含み PNG・manifest・ローカル録画を更新するため、差分を確認する。wrapper は shell 準備も含み、内部の生成・照合時間と分けて評価する。製品の入力応答の測定には使わない。
