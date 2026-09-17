# hamio 開発手順

hamio の開発は、Nix で固定したツールと Bun の固定依存を使い、編集時の診断、Git hooks、PR の CI、端末プレビューで検査する。本書のコマンドは hamio のリポジトリ直下から実行する。

製品の責務と品質条件は[基本設計](design.md)、公開データは [API 契約](api.md)、内部構成は[実装設計](implementation.md)、利用側への導入と公開は[配布手順](distribution.md)を参照する。

## 1. 対応環境とツール

| 開発環境 | CPU           | Nix system       |
| -------- | ------------- | ---------------- |
| macOS    | Apple Silicon | `aarch64-darwin` |
| Linux    | ARM64         | `aarch64-linux`  |
| Linux    | x86_64        | `x86_64-linux`   |

この表は開発 shell の対象である。製品の対応環境は配布する実行ファイルの試験で判定する。Intel Mac の shell は、固定した Nixpkgs の[プラットフォーム方針](https://nixos.org/manual/nixpkgs/unstable/release-notes#x86_64-darwin-26.11)に従って提供しない。

| 管理する定義                | ツールと用途                                                      |
| --------------------------- | ----------------------------------------------------------------- |
| `flake.nix` / `flake.lock`  | Bun、Node.js、Git、nixfmt、ShellCheck、shfmt、actionlint          |
| `package.json` / `bun.lock` | TypeScript、Biome、Prettier、Husky、lint-staged、型定義、製品依存 |
| Nix の preview shell        | agg、Python / Pillow、JetBrains Mono、Noto Sans CJK               |

`devShells.default` は日常の開発、`devShells.preview` は画像生成を担当する。ホストへ Bun・Node.js を個別に導入する必要はない。同梱用 Bun は Nix 入力が固定した公式アーカイブから展開し、開発用と同じ版を使う。Nix 向け loader 修正は同梱しない。

## 2. 初回セットアップ

`nix-command` と `flakes` が有効な Nix を用意する。[Determinate Nix の導入手順](https://docs.determinate.systems/getting-started/)を参照できる。CI は完全な commit SHA で固定した `determinate-nix-action` を使う。他の Nix 環境でも次のコマンドで互換性を確認する。

```sh
./scripts/dev.sh bun run setup
./scripts/dev.sh bun run check
```

`setup` は `bun install --frozen-lockfile --ignore-scripts` で依存を取得し、この clone に hooks を導入する。依存宣言と lockfile が不一致なら失敗し、依存パッケージの lifecycle scripts は実行しない。`core.hooksPath` が `.husky/_` 以外を指す場合は上書きせず、既存 hooks との統合を開発者が行う。

セットアップは clone ごとに実行する。`nix develop` は shell を開く操作であり、依存取得や Git 設定変更は行わない。Nix store に不足するツールの取得には通信とディスク容量が必要である。binary cache は `cache.nixos.org` を基準とし、リポジトリから別の cache や署名鍵を登録せず、署名検証を有効に保つ。

## 3. 日常の開発と検査

### 実行とビルド

```sh
nix develop
bun run hamio --help
bun run build
./dist/hamio capabilities
sh examples/form.sh
```

`hamio` script はソースを実行する。`build` は `HAMIO_BUN_RUNTIME` に設定された同梱用 Bun を使い、ホスト向けの `dist/hamio` を生成する。生成後の実行に Bun・Node.js・Nix は不要である。Python の例は利用側の Python で `python3 examples/form.py` を実行する。

| コマンド                  | 成果物                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------- |
| `bun run build`           | `dist/hamio`                                                                           |
| `bun run package`         | 実行ファイルと転送用の `dist/hamio.gz`                                                 |
| `bun run release:package` | `dist/release/` の gzip、checksum、SBOM、notices。macOS では共通のインストーラーも生成 |

梱包コマンドは候補をローカルに生成する。GitHub の証明発行と公開は Release workflow で行う。圧縮は通常の build・check に含めない。

### 編集と全体検査

対象の型診断とテストを使いながら編集し、自動修正後は差分を確認する。UI またはプレビューの生成元を変えた場合は画像を生成して開く。完了前に全体検査を通す。

```sh
bun run format
# UI またはプレビューの生成元を変更した場合
bun run preview
bun run check
```

| コマンド                                | 用途                                                   |
| --------------------------------------- | ------------------------------------------------------ |
| `bun run lint`                          | Biome、ShellCheck、actionlint                          |
| `bun run lint:fix`                      | Biome が安全と分類する Lint 修正                       |
| `bun run format` / `format:check`       | format の適用 / 読み取り専用検査                       |
| `bun run typecheck` / `typecheck:watch` | strict 型検査 / 変更監視                               |
| `bun run test` / `test:watch`           | テスト / 変更監視                                      |
| `bun run check:staged`                  | ステージ済みファイルの検査                             |
| `bun run preview` / `preview:check`     | PNG の用意 / 生成元と画像の照合                        |
| `bun run check`                         | Lint、format、型検査、テスト、プレビュー照合を順に実行 |

shell 外からは `./scripts/dev.sh bun run check` のように実行する。引数なしの `./scripts/dev.sh` も全体検査を行う。Git hooks もこの入口を使うため、GUI の PATH に Bun・Node.js がなくても動作する。Nix がない場合は失敗する。

全体検査は最初の失敗で停止し、ソースを自動修正しない。診断を修正して差分を確認し、再検査する。検査を通すためにルール、型検査、hooks を無効化しない。

### エディタと検査範囲

VS Code の設定と推奨拡張は `.vscode/` に置く。Biome と Prettier が保存時 format を担当し、[TypeScript 7 拡張](https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.native-preview)は `node_modules/typescript` を参照する。拡張は開発者が導入する。他のエディタも固定したローカルツールを使う。

| 対象           | 検査と format                                                  |
| -------------- | -------------------------------------------------------------- |
| TS・JS・JSON   | Biome。TS は宣言ファイルも型検査                               |
| Markdown・YAML | Prettier。workflow は actionlint、文書の内容とリンクはレビュー |
| Nix            | nixfmt と定義評価                                              |
| Shell・hooks   | ShellCheck と shfmt                                            |
| プレビュー     | 生成元と画像の照合、目視。manifest は Biome                    |

自動検査の範囲は [package.json](../package.json) と [.lintstagedrc.json](../.lintstagedrc.json)を参照する。Nix の変更時は次の評価も行う。各 OS の実行試験とは異なり、`bun run check` には含まれない。

```sh
nix flake check --all-systems --no-build --no-write-lock-file
```

### 製品試験と性能測定

`bun test` は契約、実際の CLI、PTY、同梱実行ファイル、配布の失敗処理、開発基盤を検証する。ビルド試験は実行ファイルを生成し、Bun のない PATH と暗黙設定ファイルのある別ディレクトリで動かす。各試験の範囲は[実装設計](implementation.md#10-検証の構成)を参照する。

性能は配布用の実行ファイルをビルドして測る。開発時の TS 実行、プレビュー、製品の起動・処理を別々の対象とする。

```sh
bun run build
bun scripts/benchmark-api.ts dist/benchmarks/api.json 30
```

二つの実行ファイルを比較する場合は、対象 commit を別の作業ディレクトリでビルドし、基準版を `dist/refactor/baseline-hamio` に置く。Nix 入力、ランタイム、ビルド設定を揃え、依存の差は lockfile とともに記録する。作業中の評価版をビルドして次を実行する。

```sh
bun run build
bun scripts/benchmark-refactor.ts dist/refactor/comparison.json dist/refactor/baseline-hamio dist/hamio 30 BASELINE_COMMIT_SHA
```

`BASELINE_COMMIT_SHA` は基準版の完全な commit SHA に置き換える。各条件・各版で2回 warmup し、30組の測定で順序を交互にする。測定中にソースや実行ファイルが変わった場合、または pipe の出力が版・試行間で異なる場合は失敗する。同じ出力契約を持つ版の比較に使う。

計測中は別の build・テストを走らせない。入力、ソース、生成物の hash と生データを保存し、OS、CPU、RAM、Bun 版、測定 API、単位、中央値、p95、改善と悪化を記録する。通常の check・hooks・CI はベンチマークを実行しない。[製品 API の性能評価](research/api-performance.md)と[実行基盤の比較](research/refactor-performance.md)を記録例とする。

## 4. Git hooks

Husky が hook を実行し、lint-staged がステージ済みファイルを検査する。

| hook       | 対象と動作                                                                    |
| ---------- | ----------------------------------------------------------------------------- |
| pre-commit | ステージ済みファイル。同時タスクは2。部分ステージの未ステージ部分を退避・復元 |
| pre-push   | 作業ツリー全体。`bun run check` で型・テスト・プレビューまで検査              |

失敗後は修正の差分を確認して再ステージする。pre-push は未コミットの内容も検査するため、送信する commit と一致するとは限らない。PR のマージ候補は GitHub 上の Quality workflow が検証する。

hooks 自体は一時 Git リポジトリで、不正な commit・push の拒否、部分ステージの復元、正常系、既存 hooks 設定の保護を試験する。ローカル hooks は回避可能なため、強制的なマージ条件は branch ruleset で管理する。

## 5. GitHub Actions

| workflow                                    | 起動条件                                                                         | 対象                                    |
| ------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------- |
| [Quality](../.github/workflows/quality.yml) | 所有者による同一リポジトリの `master` 向け PR の opened / synchronize / reopened | Ubuntu 24.04 の1ジョブで全体検査        |
| Quality の手動実行                          | ブランチと runner を指定した workflow_dispatch                                   | Ubuntu 24.04 または macOS 15            |
| [Release](../.github/workflows/release.yml) | 所有者の版タグ push、または対象タグの workflow_dispatch                          | 3対象のビルド、証明発行、公開、導入試験 |

Quality は branch push と PR close で起動せず、直接 push した commit には自動検査を付けない。Release も通常の branch push・マージでは起動しない。

### PR の検査

Quality は checkout、Nix 導入、全 system の Nix 定義評価、固定依存の取得、`bun run check`、`git diff --exit-code` を順に実行する。保存済みの PNG を照合し、画像は生成しない。文書だけの PR も検査対象とする。

Actions は完全な commit SHA で固定する。Quality の token は `contents: read` に限定し、checkout の認証情報を保持しない。CI は hooks を導入せず検査コマンドを直接実行する。`pull_request_target` は使わない。Release の権限は job ごとに分離し、[配布手順](distribution.md#保守者のリリース工程)に定める。

Quality は同じ event・ref・runner の古い実行をキャンセルする。PR、手動実行、異なる OS の実行は互いをキャンセルしない。上限は20分とし、マージに成功を要求する場合は branch ruleset で `quality` を必須に設定する。[CI の構成と測定](research/ci.md)

### OS ごとの確認

Bun・Nix・hooks・OS に関わる依存、端末 I/O、プロセス管理、同梱実行ファイルを変えた場合は Linux と macOS で試験する。PR は Linux、macOS は対象ブランチの手動実行を使う。

```sh
gh workflow run quality.yml --ref YOUR_BRANCH -f runner=macos-15
```

`YOUR_BRANCH` を対象ブランチへ置き換える。Linux の手動確認は `runner=ubuntu-24.04` を使う。手動実行は選択ブランチの commit を検査し、PR のマージ候補とは異なる場合がある。コード更新後は必要な OS の試験も更新する。

## 6. 開発用スキル

AI エージェントは [AGENTS.md](../AGENTS.md)を読み、作業に必要な領域のスキルを使う。

| スキル                                                                    | 対象                                               |
| ------------------------------------------------------------------------- | -------------------------------------------------- |
| [hamio-software-design](../.agents/skills/hamio-software-design/SKILL.md) | 入出力、状態遷移、モジュール境界、業務と UI の責務 |
| [hamio-typescript](../.agents/skills/hamio-typescript/SKILL.md)           | 境界検証、状態の型、非同期処理、strict 設定        |
| [hamio-performance](../.agents/skills/hamio-performance/SKILL.md)         | 起動、CPU、メモリ、event 量、並列性、測定条件      |

スキルは設計と判断を支援し、機械的な検査と併用する。作業範囲や外部への公開権限は依頼された範囲に従う。

## 7. 依存とツールの更新

取得元、コード差分、lifecycle scripts、lockfile を確認し、`flake.lock` と `bun.lock` を明示的に更新する。通常実行に `bunx` などの自動取得を持ち込まない。

Bun の版は Nix 入力、同梱ランタイム、`packageManager`、`engines`、型定義、配布 metadata と notices で整合させる。Node.js は開発ツールが要求する版を使う。

```sh
bun install --frozen-lockfile --ignore-scripts
nix flake check --all-systems --no-build --no-write-lock-file
bun audit
bun run format
bun run preview
bun run check
```

`@types/node` は Bun の宣言が参照する依存として `overrides` で固定し、宣言ファイルも検査する。型定義の版は開発用 Node.js の実行時 API を保証しない。リポジトリの TypeScript スクリプトは Bun で実行する。

JavaScript の既知脆弱性を `bun audit` で確認し、同梱 Bun と native 依存の advisory も確認する。UI 依存とランタイムの変更では、端末・実行ファイル・性能・配布在庫を再評価する。更新したランタイムの提供は hamio の新しいリリースで行う。

## 8. ターミナル UI のプレビュー

実際の疑似端末（PTY）の出力を PNG と GIF に変換し、チャットと PR でレビューする。[プレビュー一覧](previews/README.md)で対象を識別する。

| シナリオ  | 実行対象                         | 端末サイズ | 確認範囲                                   |
| --------- | -------------------------------- | ---------- | ------------------------------------------ |
| `product` | 製品 CLI の form・stream・render | 80列・28行 | 選択、確認、進捗、秘密値の非表示、結果表   |
| `fixture` | 録画基盤の検証用プログラム       | 80列・20行 | 日本語、色、入力、カーソル更新の記録と描画 |

### 生成と再利用

```sh
./scripts/preview.sh
./scripts/preview.sh --recording
```

既定の操作は PNG を、`--recording` は PNG とローカルの GIF・cast を照合し、不足・変更・破損時に生成する。`--force` は一致していても再生成する。`bun run preview:check` は読み取り専用の照合だけを行う。

既定の Nix shell 内で画像が最新なら描画ツールを追加取得しない。生成が必要なら preview shell を使う。shell 外からの呼び出しは preview shell の準備も含む。繰り返し編集する場合は `nix develop .#preview` 内で `bun run preview` を使う。

cast は出力と時刻を記録する asciicast ファイル、manifest は生成元・生成物の hash を記録する JSON とする。

| 出力                            | 制限と管理                                                    |
| ------------------------------- | ------------------------------------------------------------- |
| `docs/previews/*.png`           | 1枚512 KiB以下。ソースと同じ commit に含める                  |
| `docs/previews/manifest.json`   | PNG の生成元、画像 hash、生成環境。PNG と同じ commit に含める |
| `dist/preview/*.cast` / `*.gif` | 各16 MiB以下。ローカル専用                                    |
| `dist/preview/manifest.json`    | GIF・cast と生成元の hash。ローカル専用                       |

生成元は `scripts/preview/**/*.ts`、`scripts/preview*.sh`、`src/**/*`、`examples/**/*.json`、`flake.nix`、`flake.lock`、`package.json`、`bun.lock` とし、内容と追加・削除を照合する。format と依存設定の変更も更新検出の対象になる。PNG 更新で録画との対応が変わった場合は、次の `--recording` で録画を生成する。CI はローカル録画を要求しない。

### 目視確認と共有

PNG を画像として開き、日本語、余白、折り返し、色、カーソル更新の残骸を確認する。入力と状態遷移を変えた場合は GIF の操作途中も確認する。PNG と manifest をソースと一緒にステージする。

PR には[テンプレート](../.github/pull_request_template.md)の欄で画像を埋め込む。commit・push 後、`git rev-parse HEAD` の完全な SHA を次の `COMMIT_SHA` に指定する。

```md
![入力画面](https://raw.githubusercontent.com/9uiLe/hamio/COMMIT_SHA/docs/previews/product-input.png)
![結果画面](https://raw.githubusercontent.com/9uiLe/hamio/COMMIT_SHA/docs/previews/product-result.png)
```

PR 更新時は画像リンクも更新し、シナリオ、確認状態、未確認の OS・端末を添える。チャットには確認した PNG をローカル絶対パスでインライン表示する。GIF を公開する場合は内容を確認して手動で添付する。外部録画サービスへの自動送信と `.cast` 全文のチャット転記は行わない。

### シナリオと安全性

[scenarios.ts](../scripts/preview/scenarios.ts)は実行コマンド、端末サイズ、待つ出力、送るキー、撮影位置を定義する。期待出力へ到達してから入力し、起動速度に撮影時刻を依存させない。変更対象をダミーデータで再現し、外部入力ファイルも `sourceHashes` の照合へ含める。

| ファイル                                        | 責務                                     |
| ----------------------------------------------- | ---------------------------------------- |
| [generate.ts](../scripts/preview/generate.ts)   | 引数、再利用と生成の選択、出力パス       |
| [artifacts.ts](../scripts/preview/artifacts.ts) | 照合、サイズ・形式検証、更新対象の診断   |
| [capture.ts](../scripts/preview/capture.ts)     | PTY の実行、出力記録、撮影位置、終了判定 |
| [render.ts](../scripts/preview/render.ts)       | 画像化、生成前後の入力源検証、保存       |
| [preview-env.sh](../scripts/preview-env.sh)     | preview 用 Nix shell の準備              |

Bun の PTY が stdout・stderr を記録し、agg が端末命令を描画する。シナリオごとに cast を一つ保持し、撮影位置を event 番号で指定する。PNG の変換は一つの Pillow プロセスで行う。PNG には閲覧用の入力前待機を設けず、GIF では500 ms待つ。期待出力の待機とシナリオ処理は両形式で行う。

キャプチャと描画は順次実行する。既定上限はキャプチャ15秒、出力1 MiB、10,000 event、描画コマンド60秒とする。agg の Rayon スレッドプールは2、GIF は10 fpsとする。これらは製品 API の性能予算やプロセス全体のスレッド数とは別の制限である。

異常終了、不足画面、上限超過、timeout では失敗する。生成中に入力源が変わった場合は成果物を採用しない。子プロセスには PATH、固定した端末・locale、一時 HOME などの限定した環境を渡し、`.env` 読み込みと依存の自動取得を無効にする。同じ OS 権限で動くため、未信頼コードの sandbox には使わない。

内容照合は更新漏れ、目視は見た目を検査する。実端末、画面読み上げ、製品性能は別の試験で評価する。プレビューの性能記録は[測定資料](research/preview-performance.md)を参照する。

## 参照資料

- 設定: [flake.nix](../flake.nix)、[package.json](../package.json)、[tsconfig.json](../tsconfig.json)、[biome.json](../biome.json)。
- 検査: [Biome](https://biomejs.dev/guides/getting-started/)、[Prettier](https://prettier.io/docs/cli)、[Husky](https://typicode.github.io/husky/)、[lint-staged](https://github.com/lint-staged/lint-staged)、[Bun install](https://bun.com/docs/pm/cli/install)。
- 端末記録: [Bun PTY](https://bun.com/docs/runtime/child-process#terminal-pty-support)、[asciicast v2](https://docs.asciinema.org/manual/asciicast/v2/)、[agg](https://docs.asciinema.org/manual/agg/usage/)。
