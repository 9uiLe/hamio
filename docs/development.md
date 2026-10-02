# hamio 開発手順

hamio の編集、検査、ビルドは固定した Nix 環境で行う。エディタ、Git hooks、GitHub Actions は同じリポジトリ設定を使い、ローカルでも変更の問題を検出する。本書のコマンドは、特記がなければ hamio のリポジトリ直下で実行する。

製品の責務と依存境界は[基本設計](design.md)、公開契約は [Presentation](presentation-api.md)、[Recording](presentation-recording.md)、[Form](interaction-form.md)、導入と公開は[配布手順](distribution.md)に定める。

## 1. 対応環境とツール

開発 shell は `aarch64-darwin`、`aarch64-linux`、`x86_64-linux` に対応する。配布実行ファイルの対応環境は[配布手順](distribution.md#配布方式と対象環境)で別に評価する。Intel Mac の shell は固定 Nixpkgs の[プラットフォーム方針](https://nixos.org/manual/nixpkgs/unstable/release-notes#x86_64-darwin-26.11)に従い提供しない。

日常開発は `devShells.default`、画像生成は `devShells.preview` を使う。Bun・Node.js をホストへ別途導入する必要はない。ツールは [flake.nix](../flake.nix)・`flake.lock`、JavaScript 依存は [package.json](../package.json)・`bun.lock` を正本とする。

| 実行場所        | Runtime と固定方法                                                       | 役割                                                                                                    |
| --------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 利用側          | 同梱 Bun 1.4.2 を含む native executable。外部の Bun・Node.js・Nix は不要 | 製品の実行                                                                                              |
| 開発・build・CI | Nix に固定した Bun 1.4.2 と Node.js 24 系（現在 24.20.0）                | Bun はソース実行・依存取得・test・compile、Node は一部開発 tool の実行。Node を製品 runtime にしない    |
| TypeScript 宣言 | `@types/bun` 1.4.2 と `@types/node` の固定 override                      | Bun 上で使う `node:` API の型確認。`@types/node` の major は実行する Node の版や製品 API の保証ではない |

`packageManager` と `engines.bun` は Bun 1.4.2、`engines.node` は開発用の `>=24.20.0 <25`。更新時は本書の[依存とツールの更新](#7-依存とツールの更新)に従い、Nix、型、同梱 runtime、lockfile、配布 metadata を一緒に確認する。

### Tool ownership

| Tool       | 対象と責務                                                         | 固定元                                  |
| ---------- | ------------------------------------------------------------------ | --------------------------------------- |
| Biome      | TS/JS/JSON の lint と format。Markdown/YAML は対象外               | `bun.lock`、`biome.json`                |
| Prettier   | Markdown/YAML の format と構文 parse。意味・リンクの lint はしない | `bun.lock` の 3.9.7、`.prettierrc.json` |
| nixfmt     | Nix の format                                                      | `flake.lock`                            |
| shfmt      | shell の format                                                    | `flake.lock`                            |
| ShellCheck | shell の静的 lint                                                  | `flake.lock`                            |
| actionlint | GitHub Actions workflow の静的 lint                                | `flake.lock`                            |

Prettier は **Bun の開発依存だけ**を実行用の正本とする。固定 Nixpkgs に Prettier 3.9.6 はあるが、dev shell に入れておらず使用しない。`bun run` と lint-staged は `node_modules/.bin` の 3.9.7 を使い、VS Code も `prettier.prettierPath` で同じ local package を指定する。editor が local package を見つけられない場合は先に `setup` を実行する。別のエディタも local package を参照する。Nix から Prettier を追加して二版を同時に運用しない。

## 2. 初回セットアップ

`nix-command` と `flakes` が有効な Nix を用意する。[Determinate Nix の導入手順](https://docs.determinate.systems/getting-started/)を参照できる。clone ごとに次を実行する。

```sh
./scripts/dev.sh bun run setup
./scripts/dev.sh bun run check
./scripts/dev.sh bun run build
./dist/hamio presentation capabilities
```

setup は `bun install --frozen-lockfile --ignore-scripts` による依存取得と、Git hooks の導入を行う。lockfile と依存宣言の不一致は失敗とし、依存の lifecycle scripts は実行しない。既存の `core.hooksPath` が `.husky/_` 以外なら上書きせず、開発者が既存 hooks との統合を行う。

`nix develop` は shell を開くだけで、依存取得や Git 設定変更は行わない。Nix store に不足するツールの取得には通信と空き容量を使う。binary cache は `cache.nixos.org` を基準とし、リポジトリから追加の cache・署名鍵を登録せず、署名検証を有効に保つ。

`setup` は clone 固有の Git hook 設定を変更する。既存作業ツリーで初期導線を再検証するときは、その作業ツリーの Git 設定を触らず、別の clean clone で上の順序を実行する。

## 3. 日常の開発と検査

### 実行とビルド

```sh
nix develop
bun run hamio --help
bun run build
./dist/hamio presentation capabilities
sh examples/form.sh
```

`bun run hamio` は TypeScript のソース、`dist/hamio` はホスト向けの同梱実行ファイルを実行する。Python の接続例は利用側の Python で `python3 examples/form.py` を実行する。

`bun run package` はローカル実行ファイルを `dist/hamio.gz` に圧縮する。公開用の候補生成・検証には[配布コマンド](distribution.md#配布候補の生成と検証)を使う。試験と候補生成は専用の一時領域を使い、共有の `dist/hamio` を読み書きしない。

### 編集から完了まで

型診断と対象テストを確認しながら編集する。format や Lint の自動修正は明示的に実行し、差分を確認する。UI または Catalog capture の生成元を変更したら代表画像を確認し、完了前に全体検査を通す。

```sh
bun run format
# UI または Catalog capture の生成元を変更した場合
bun run catalog:check
bun run check
```

| Command                 | 責務                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `bun run format`        | 対象を所有する formatter で書き換える。差分を確認する                                                |
| `bun run lint`          | Biome、ShellCheck、actionlint の静的規則を検査する                                                   |
| `bun run typecheck`     | `src`・`scripts`・`tests` を emit なしで型検査する                                                   |
| `bun run test`          | Bun の API・統合・実行ファイル・開発基盤 test を走らせる                                             |
| `bun run build`         | 作業中のソースからホスト用 native `dist/hamio` を作る                                                |
| `bun run catalog`       | 開発用 semantic Catalog を `127.0.0.1:4174` で起動する。競合時は `HAMIO_CATALOG_PORT` を指定する     |
| `bun run catalog:check` | scenario inventory、Terminal / HTML、HTTP、PTY 条件行列、追跡 capture の鮮度を検査する。生成はしない |
| `bun run check`         | lint → format check → typecheck → test → Catalog check。修正・成果物生成はしない                     |

`check` に `build` を含めない。test は隔離した一時領域でも compile を検証するが、`build` は共有 `dist/hamio` を生成する別の成果物確認であり、編集途中の全体検査や pre-push の時間と副作用を増やす。**完了確認は `check` の後に `build` と `./dist/hamio presentation capabilities` を実行する。** Quality CI も同じ順番で実行する。`catalog:check` は現行 scenario と代表 PTY capture を読み取り検査し、画像を生成しない。個別検査・watch は [package.json](../package.json) を参照する。

shell 外では `./scripts/dev.sh bun run check` の形式で固定環境を呼び出す。引数なしの `./scripts/dev.sh` も全体検査を行う。hooks もこの入口を使うため、GUI の PATH に Bun・Node.js がなくても Nix があれば実行できる。

全体検査と hooks は自動修正せず、最初の失敗で停止する。修正して差分を確認し、再検査する。検査を通すためにルール、型検査、hooks を無効化しない。

### エディタと Nix の検査

VS Code の保存時 format・型診断と推奨拡張は [.vscode/](../.vscode/) を参照する。拡張は開発者が導入し、他のエディタでも同じ固定ツールを使う。Markdown の文章・リンクは formatter では検証されないためレビューする。

TypeScript は `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes` で Phase 1 の判別 union と欠落値を守る。`noUnusedLocals` / `noUnusedParameters` は不要な実装、`noImplicitOverride` / `noFallthroughCasesInSwitch` は継承・分岐の誤り、`isolatedModules` / `verbatimModuleSyntax` は Bun の単一ファイル変換、`forceConsistentCasingInFileNames` は OS 間の import 差を確認する。`moduleResolution: Bundler`、`module: Preserve`、`.ts` import を許す `allowImportingTsExtensions` は Bun の実行・compile と一致する。`noEmit` により typecheck と native build を分離し、`skipLibCheck: false` で依存宣言も検査する。`include` は `src`・`scripts`・`tests`、`dist` と `coverage` は除外する。三者とも Bun の型と同じ import 規則を使うため今は一つの tsconfig で足りる。成果物や target が分かれたときだけ分割を検討する。

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

### 成果物と Catalog の入口

`build` は Presentation CLI と Form interaction を含む native executable 一つだけを生成し、Catalog 開発資産は含めない。論理 module は単一 private package に置いている。package 分割は import 規則の強制、独立配布、build/test や version の責務が実際に分かれた場合に判断する。TypeScript SDK は consumer artifact ではない。HTML Report renderer は明示的な `presentation report` 用に native executable へ含まれる。公開を決定する場合は release 資産、Nix 配置、SBOM、署名、利用側の版固定を一緒に見直す。

Catalog は現在 development-only artifact として存在する。人間向けの `bun run catalog` と automation / CI 向けの `bun run catalog:check` を root に置き、後者は通常の `bun run check` に含める。共有 scenario の正本は [`scripts/catalog/scenarios.ts`](../scripts/catalog/scenarios.ts) で、Terminal と HTML は同じ解決済み `PresentationState` を読む。実 Terminal 画像は汎用 [`scripts/terminal-capture/capture.ts`](../scripts/terminal-capture/capture.ts) を利用し、画像生成時だけ preview shell の描画 tool を使う。起動・検査・画像更新の手順は[Semantic Catalog と Renderer review](#9-semantic-catalog-と-renderer-review)にまとめる。

### 製品試験と性能測定

通常の `bun test` は API、CLI、PTY、実行ファイル、失敗処理、開発基盤を確認する。変更した境界に応じて次の検査を選ぶ。

| 入口                                                                                                                          | 検査の範囲                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [interaction.test.ts](../tests/interaction.test.ts)                                                                           | 回答・終了・状態・上限・秘密、入出力の順序と資源解放、描画・背圧               |
| [executable.test.ts](../tests/executable.test.ts)                                                                             | 実行ファイル、開発ランタイムのない PATH、暗黙設定、Shell・PTY                  |
| [distribution.test.ts](../tests/distribution.test.ts)・[nix-release.test.ts](../tests/nix-release.test.ts)                    | GitHub CLI の代替実装で検証条件、失敗時の非実行・保持、更新・復旧・lock を確認 |
| [release.test.ts](../tests/release.test.ts)                                                                                   | 別ルートのビルド、入力の固定、資産の配置・復元、公開条件                       |
| [hooks.test.ts](../tests/hooks.test.ts)                                                                                       | 検査の拒否・復元                                                               |
| [presentation.test.ts](../tests/presentation.test.ts)・[protocol-v2.test.ts](../tests/protocol-v2.test.ts)                    | v2 の状態遷移・Replay、未信頼 JSON/NDJSON の境界検証                           |
| [catalog.test.ts](../tests/catalog.test.ts)・[terminal-renderer.test.ts](../tests/terminal-renderer.test.ts)・`catalog:check` | 共有 scenario、Terminal / HTML 表現、Catalog と PTY capture                    |
| `release:verify`                                                                                                              | 独立した二回の依存取得・梱包、全資産の一致、gzip から展開した製品の試験        |
| Release workflow                                                                                                              | 実際の provenance と候補の動作、公開後の署名・資産帰属・インストーラー・Action |
| `nix flake check`                                                                                                             | 固定した公開資産の取得・hash、Nix 配置後の独立プロジェクトからの実行           |

`HAMIO_TEST_BINARY` を指定した Form・実行ファイル試験は、渡された binary を再生成せずに使う。代替実装による試験を実際の署名検証の成功と扱わず、同一環境の二候補の一致を別ホストでの一致へ一般化しない。

Form interaction、Presentation Domain / Protocol / Renderer、Recording / Report と Catalog は責務ごとの test で確認し、同じ遷移規則を全層へ複製しない。 削除した旧経路と Form の移設は [Phase 11 記録](rearchitecture/phase-11-migration-cleanup.md)を参照する。

Phase 10 の file format・crash recovery・public CLI・native PTY は [recording.test.ts](../tests/recording.test.ts)、[recording-cli.test.ts](../tests/recording-cli.test.ts)、[executable.test.ts](../tests/executable.test.ts) で確認する。Recording の wire 契約は[Recording 形式](presentation-recording.md)、実測と未確認範囲は [Phase 10 記録](rearchitecture/phase-10-recording-report.md)を正本とする。

性能は本番と同じ設定の native executable で測る。入力規模、OS、runtime、sample 数、stdout/stderr bytes、CPU/RSS を残し、異なる契約の過去版へ改善率を主張しない。[Phase 10 の記録と復元の実測](rearchitecture/phase-10-recording-report.md)を参照する。通常の `check` と CI は benchmark を実行しない。業務の JSON 生成・転送・待機・補助プロセスも製品導入の追加負荷として評価する。

## 4. Git hooks

Husky が hook を起動し、lint-staged がステージ済みファイルへ種別ごとの検査を適用する。

| hook       | 対象と動作                                                               |
| ---------- | ------------------------------------------------------------------------ |
| pre-commit | 部分ステージの未ステージ部分を退避・復元し、同時タスク2で検査            |
| pre-push   | 作業ツリー全体へ `bun run check` を実行。共有 `dist` の build は行わない |

失敗時は差分を修正して再ステージする。pre-push には未コミットの内容も含まれるため、送信 commit や PR のマージ候補と検査対象が一致するとは限らない。マージ候補の確認は Quality workflow が担当する。

pre-push は Git が渡すリポジトリ固有の環境変数を検査前に外す。一時リポジトリを作るテストが、呼び出し元のブランチ・index・Git 設定を変更しないためである。必須のマージ条件は GitHub の ruleset で管理する。

## 5. GitHub Actions

| 確認したい変更                                     | 使う workflow                                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| すべての PR（文書を含む）                          | [Quality](../.github/workflows/quality.yml)。マージ候補を Ubuntu の1ジョブで検査                             |
| OS 依存の変更                                      | Quality を対象 ref・runner で手動実行。下記の OS ごとの確認に従う                                            |
| 配布候補・公開・公開物の導入                       | [Release](../.github/workflows/release.yml)。[配布手順](distribution.md#保守者のリリース工程)の3モードを使う |
| Nix パッケージの定義・lockfile・固定情報・導入試験 | [Nix package](../.github/workflows/nix.yml)。関連する PR と手動実行で3対象の取得・配置・実行を確認           |

通常の PR は共通検査を一度実行し、OS・CPU に依存する配布検証は明示的に選ぶ。Nix パッケージの関連変更だけは3対象の自動検査を追加する。CI の負荷を比較するときは検査本体だけでなく Nix の準備・cache 取得を含む総時間を見る。

Quality は所有者または Dependabot による同一リポジトリの `master` 向け PR と、所有者の手動実行に限る。branch push、PR close、タグ push では起動しない。外部 fork や `pull_request_target` で実行せず、token は読み取り専用、checkout に認証を残さず、Actions を完全な commit SHA で固定する。

Quality は全 system の Nix 定義評価、固定依存の取得、`bun run check`、`bun run build` と生成 executable の `capabilities`、追跡ファイルの差分確認を行う。CI では hooks を導入せず検査を直接呼び、`quality` 成功をマージの必須条件とする。手動実行の ref は PR のマージ候補と異なり得るため結果に対象 commit を残す。Nix の3対象も併用する手動実行は[配布手順](distribution.md#nix-パッケージの保守)を参照する。

| CI にある追加 step     | 分類と local 再現                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Nix 定義評価           | 環境と repository 定義の検証。`nix flake check --all-systems --no-build --no-write-lock-file`                    |
| 固定依存の取得         | bootstrap。clean clone の `./scripts/dev.sh bun run setup` が同じ frozen install を行う。CI は hook を導入しない |
| native build と起動    | `check` と分けた成果物の品質条件。`./scripts/dev.sh bun run build`、`./dist/hamio presentation capabilities`     |
| `git diff --exit-code` | 追跡ファイルを検査や build が書き換えない repository integrity check。同じ command を local で実行可能           |

Nix package job は固定された**公開資産**の取得・配置・実行を3対象で調べる別条件で、作業中ソースの `build` と重複しない。Release workflow はさらに audit、二候補の一致、SBOM・attestation と consumer 導入を扱う。通常の PR にこの release gate を暗黙追加しない。

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

新しい機能では **標準 Web / Runtime / Language API → 既存の依存・utility → 小さく検証可能な内部実装 → 外部依存** の順に検討する。外部依存を既定で追加せず、dependency 数ではなく長期の複雑性、security、correctness、保守費用で判断する。複雑な parser、暗号、sanitizer、Unicode、accessibility primitive 等を依存回避のために危険な自作実装へ置き換えない。

外部依存が必要な場合は導入前に publisher / repository、活動状況、security policy と既知 advisory、直接・推移依存、install / lifecycle scripts、native binary・network access、license、API 安定性、更新頻度を確認する。`bun install --frozen-lockfile --ignore-scripts` で使用可能か、production / development-only / build-only / catalog-only のどれか、native executable・HTML artifact・Catalog への影響も PR に記録する。未確認の項目は推測せず未確認と明記する。各 Phase の終わりに既存依存も再評価し、責務がなくなったものは削除する。

Bun の更新では Nix 入力、同梱ランタイム、`packageManager`、`engines`、型定義、配布 metadata と notices を揃える。Node.js は開発ツールの要求版を使う。`@types/node` は Bun の宣言が参照する依存として `overrides` で固定し、宣言ファイルも検査する。型定義の版を実行時 API の保証とはみなさない。

```sh
bun install --frozen-lockfile --ignore-scripts
nix flake check --all-systems --no-build --no-write-lock-file
bun audit
bun run format
bun run catalog:check
bun run check
```

`bun audit` は npm 依存を検査する。同梱 Bun と native 部品の advisory、許諾、ソース提供条件は別途確認し、対象 revision と根拠を[リリース評価](release-readiness.md)から参照できる形で残す。UI・ランタイムの変更では端末、性能、在庫、配布物を再評価し、ランタイムの修正は新しい製品版で利用側へ届ける。[セキュリティ方針](../SECURITY.md)

## 8. 現行 Terminal capture

PTY の実際の出力は [`scripts/terminal-capture/capture.ts`](../scripts/terminal-capture/capture.ts)で取得する。Catalog の代表画像は production Terminal renderer の State を開発用 runner から実 PTY へ描画した結果であり、ブラウザ上の模造 Terminal ではない。Form の対話画面は `interaction.test.ts` と native executable の実 PTY 試験で確認する。視覚変更時は生成した PNG を画像として開き、幅、CJK、状態文言、制御文字、redacted を確認する。旧 v1 製品 preview の fixture / command は現行の検査に含めない。

## 9. Semantic Catalog と Renderer review

Catalog は開発専用で、Phase 3 の State / Event を両媒体で読むための検査環境である。consumer 向け CLI・native executable には入れない。Terminal pane と HTML pane は各 production renderer を使い、同じ解決済み `PresentationState` を受け取る。HTML の実装境界とブラウザ確認は [Phase 8 記録](rearchitecture/phase-8-html.md) を参照する。

```sh
./scripts/dev.sh bun run catalog
# http://127.0.0.1:4174/
./scripts/dev.sh bun run catalog:check
```

`catalog` は scenario、Terminal 80/40 列、HTML 360/640/1200 px と Light/Dark、Motion、Report/Live の表示条件を選べるローカル server を起動する。`HAMIO_CATALOG_PORT` に別の空きポートを指定でき、競合時は起動に失敗する。Terminal pane は `renderTerminal(PresentationState)` の色・animation なしの実出力、HTML pane は `renderHtml(PresentationState)` の文書で、同じ [shared scenario registry](../scripts/catalog/scenarios.ts) から解決する。Event scenario は Phase 3 reducer を通す。JSON panel は補助表示であり両 renderer の代わりではない。表示条件は Catalog 専用で、consumer API ではない。

`catalog:check` は inventory、全 scenario の解決、両 renderer、HTTP route、TTY 色 / animation 4 条件、non-TTY、代表 PTY 経路と追跡 PNG の鮮度を調べる。日常の `check` に含まれるが画像生成はしない。代表画像を更新する場合だけ固定 preview shell で次を実行し、[Catalog の PNG](catalog-previews/)を画像として開く。

```sh
nix develop .#preview --no-write-lock-file --command bun scripts/catalog/capture.ts
```

PNG は Phase 3 の State → Phase 7 Terminal renderer → 開発用 runner → 既存 PTY capture → cast 描画の結果である。manifest は各画像の解決済み State、幅・行数、renderer と capture の source hash、PNG hash を追跡する。代表3件だけを保存し、全 scenario の screenshot は作らない。汎用 capture は Catalog と native executable の PTY 試験で再利用する。Catalog の HTML は browser でも default / narrow と長文 scenario を確認し、status text、表、見出し順、escape をレビューする。

HTML は [代表的な実ブラウザ画像](html-previews/README.md)と [Phase 8 の検証記録](rearchitecture/phase-8-html.md)を参照する。これらの画像は手動 review evidence であり、`catalog:check` は全 Shared Scenario を両 renderer で検査する。HTML の screenshot 全組合せ生成や browser binary を通常の `check` に必須としない。
