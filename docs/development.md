# hamio 開発手順

開発者は Nix の固定環境で編集、検査、ビルドを行う。エディタ、Git hooks、PR の CI は同じリポジトリ設定を使う。本書のコマンドは、特記がなければ hamio のリポジトリ直下で実行する。

製品の責務は[基本設計](design.md)、公開形式は [API 契約](api.md)、内部の処理と資源の寿命は[実装設計](implementation.md)を正本とする。利用側への導入とリリース操作は[配布手順](distribution.md)に定める。

## 1. 対応環境とツール

| 開発環境 | CPU           | Nix system       |
| -------- | ------------- | ---------------- |
| macOS    | Apple Silicon | `aarch64-darwin` |
| Linux    | ARM64         | `aarch64-linux`  |
| Linux    | x86_64        | `x86_64-linux`   |

開発 shell の提供範囲と製品の保証範囲を区別する。製品の対応環境は配布実行ファイルで試験する。Intel Mac の shell は固定 Nixpkgs の[プラットフォーム方針](https://nixos.org/manual/nixpkgs/unstable/release-notes#x86_64-darwin-26.11)に従い提供しない。

| 定義                       | 管理対象                                                          |
| -------------------------- | ----------------------------------------------------------------- |
| `flake.nix`・`flake.lock`  | Bun、Node.js、Git、nixfmt、ShellCheck、shfmt、actionlint          |
| `package.json`・`bun.lock` | TypeScript、Biome、Prettier、Husky、lint-staged、型定義、製品依存 |
| Nix の preview shell       | agg、Python / Pillow、JetBrains Mono、Noto Sans CJK               |

`devShells.default` は日常開発、`devShells.preview` は画像生成用とする。ホストへ Bun・Node.js を別途導入する必要はない。同梱用 Bun は Nix が版と hash を固定した公式アーカイブから展開し、Nix 向け loader 修正を加えずに使う。

## 2. 初回セットアップ

`nix-command` と `flakes` が有効な Nix を用意する。[Determinate Nix の導入手順](https://docs.determinate.systems/getting-started/)を参照できる。準備後、clone ごとに次を実行する。

```sh
./scripts/dev.sh bun run setup
./scripts/dev.sh bun run check
```

setup は `bun install --frozen-lockfile --ignore-scripts` による依存取得と、この clone の Git hooks 導入を行う。依存宣言と lockfile の不一致は失敗とし、依存の lifecycle scripts は実行しない。既存の `core.hooksPath` が `.husky/_` 以外なら上書きしないため、開発者が既存 hooks との統合を行う。

`nix develop` は shell を開く操作であり、依存取得や Git 設定変更は行わない。Nix store に不足するツールの取得には通信と空き容量が必要である。binary cache は `cache.nixos.org` を基準とし、リポジトリから追加の cache・署名鍵を登録せず、署名検証を有効に保つ。

## 3. 日常の開発と検査

### 実行とビルド

```sh
nix develop
bun run hamio --help
bun run build
./dist/hamio capabilities
sh examples/form.sh
```

`bun run hamio` は TypeScript のソースを実行する。`bun run build` はホストの OS・CPU 向け実行ファイルを生成する。Python の例は利用側の Python で `python3 examples/form.py` を実行する。

| コマンド                  | 用途と成果物                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| `bun run build`           | 指定された同梱用 Bun で `dist/hamio` を生成                                                      |
| `bun run package`         | ビルドし、転送用の `dist/hamio.gz` を生成                                                        |
| `bun run release:package` | 専用の作業領域で依存取得・ビルド・梱包を行い、`dist/release/` に配布候補を保存                   |
| `bun run release:verify`  | 独立した二候補を比較し、展開後の実行試験に合格した資産と `dist/release-verification.json` を保存 |

ビルドはルート、ランタイム、出力先を引数で受け取る。試験と配布候補の生成はそれぞれの一時領域を使い、共有の `dist/hamio` を読み書きしない。圧縮は梱包工程で行う。配布コマンドのローカル実行は、GitHub への公開・証明発行を行わない。

### 編集から完了まで

型診断と対象テストを確認しながら編集する。自動修正は明示的に実行し、その差分を確認する。UI または生成元を変えた場合はプレビューを生成して画像を開き、作業完了前に全体検査を通す。

```sh
bun run format
# UI またはプレビューの生成元を変更した場合
bun run preview
bun run check
```

| コマンド                                | 検査・操作                                             |
| --------------------------------------- | ------------------------------------------------------ |
| `bun run lint`                          | Biome、ShellCheck、actionlint                          |
| `bun run lint:fix`                      | Biome が安全と分類する Lint 修正                       |
| `bun run format` / `format:check`       | format の適用 / 読み取り専用の照合                     |
| `bun run typecheck` / `typecheck:watch` | strict 型検査 / 変更監視                               |
| `bun run test` / `test:watch`           | テスト / 変更監視                                      |
| `bun run check:staged`                  | ステージ済みファイルの検査                             |
| `bun run preview` / `preview:check`     | PNG の生成・再利用 / 生成元と画像の照合                |
| `bun run check`                         | Lint、format、型検査、テスト、プレビュー照合を順に実行 |

shell 外では `./scripts/dev.sh bun run check` の形式で固定環境を呼び出す。引数なしの `./scripts/dev.sh` も全体検査を行う。Git hooks はこの入口を使うため、GUI の PATH に Bun・Node.js がなくても実行できる。Nix がなければ失敗する。

全体検査と hooks はソースを自動修正せず、最初の失敗で停止する。診断を修正して差分を確認し、再検査する。検査を通す目的でルール、型検査、hooks を無効化しない。

### エディタとファイル種別

VS Code の設定・推奨拡張は `.vscode/` に置く。Biome と Prettier が保存時 format を担当し、[TypeScript 7 拡張](https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.native-preview)は `node_modules/typescript` を参照する。拡張は開発者が導入する。他のエディタでも同じ固定ツールを使う。

| 対象           | 適用する検査                                             |
| -------------- | -------------------------------------------------------- |
| TS・JS・JSON   | Biome。TS は宣言ファイルを含む型検査                     |
| Markdown・YAML | Prettier。workflow は actionlint、文章・リンクはレビュー |
| Nix            | nixfmt と定義評価                                        |
| Shell・hooks   | ShellCheck と shfmt                                      |
| プレビュー     | 生成元・画像の照合と目視。manifest は Biome              |

自動検査の設定は [package.json](../package.json)、[.lintstagedrc.json](../.lintstagedrc.json)、[tsconfig.json](../tsconfig.json)、[biome.json](../biome.json)に置く。Nix の変更では次の評価も行う。これは定義の評価であり、各 OS での実行試験ではない。

```sh
nix flake check --all-systems --no-build --no-write-lock-file
```

### 製品試験と性能測定

通常の `bun test` は API、CLI、PTY、同梱実行ファイル、配布の失敗処理、独立ビルド、開発基盤を検証する。試験用の実行ファイルは一時領域に生成する。`HAMIO_TEST_BINARY` を指定した API・実行ファイル試験は、渡された実行ファイルをそのまま使う。

`release:verify` は異なるディレクトリで固定依存を取得し、二回のビルド・梱包の全資産を比較する。gzip を展開した実行ファイルの hash と動作を確認し、通常のソース試験と配布物の試験を結び付ける。[検証の構成](implementation.md#10-検証の構成)に各入口を示す。

性能は本番と同じ設定の実行ファイルで測る。開発時の TS 実行、プレビューの処理時間、製品の応答を別々に評価する。

```sh
bun run build
bun scripts/benchmark-api.ts dist/benchmarks/api.json 30
```

二版を比較する場合は、基準 commit を別ディレクトリでビルドして `dist/refactor/baseline-hamio` に保存する。Nix、ランタイム、ビルド設定を揃え、依存差分は lockfile とともに記録する。評価版は次のコマンドで生成・測定する。`BASELINE_COMMIT_SHA` は基準版の完全な commit SHA に置き換える。

```sh
bun run build
bun scripts/benchmark-refactor.ts dist/refactor/comparison.json dist/refactor/baseline-hamio dist/hamio 30 BASELINE_COMMIT_SHA
bun scripts/benchmark-progress.ts dist/refactor/progress.json dist/refactor/baseline-hamio dist/hamio 5
```

実行基盤の比較は各条件・各版2回 warmup し、30組で順序を交代する。ソース・実行ファイルの測定中の変更や、版・試行間の pipe 出力の不一致は失敗とする。同じ出力契約を持つ版に使う。

進捗の比較は PTY に実行ファイルを接続し、150 ms間隔で同じ状態を10回送る。各版1回 warmup 後、5組で順序を交代する。経過時間には送り手の待機を含むため、描画遅延の指標には使わない。

測定中は別の benchmark、build、test を実行しない。入力・ソース・生成物の hash、生データ、OS、CPU、RAM、Bun、端末、測定 API、単位、試行数、中央値、p95、改善と悪化を記録する。通常の検査・hooks・CI はベンチマークを実行しない。[API の評価](research/api-performance.md)、[実行基盤の比較](research/refactor-performance.md)、[配布基盤と実行経路の評価](research/reproducibility-performance.md)を記録例とする。

## 4. Git hooks

Husky が hook を起動し、lint-staged がステージ済みファイルを検査する。

| hook       | 対象と動作                                                                        |
| ---------- | --------------------------------------------------------------------------------- |
| pre-commit | ステージ済みファイルを同時タスク2で検査。部分ステージの未ステージ部分を退避・復元 |
| pre-push   | 作業ツリー全体へ `bun run check` を実行                                           |

失敗後は修正差分を確認して再ステージする。pre-push には未コミットの内容も含まれるため、送信 commit や PR のマージ候補と検査対象が一致するとは限らない。マージ候補は Quality workflow で検査する。

hooks は一時 Git リポジトリで正常系、不正な commit・push の拒否、部分ステージの復元、既存設定の保護を試験する。ローカル hooks は回避可能であり、必須のマージ条件は branch ruleset で管理する。

## 5. GitHub Actions

| workflow                                    | 起動条件                                                                         | 実行環境                     |
| ------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------- |
| [Quality](../.github/workflows/quality.yml) | 所有者による同一リポジトリの `master` 向け PR の opened / synchronize / reopened | Ubuntu 24.04 の1ジョブ       |
| Quality の手動実行                          | ブランチと runner を選ぶ `workflow_dispatch`                                     | Ubuntu 24.04 または macOS 15 |
| [Release](../.github/workflows/release.yml) | 所有者の版タグ push、または版タグを選ぶ `workflow_dispatch`                      | macOS arm64、Linux x64/arm64 |

Quality は branch push と PR close を対象にしない。Release は通常の branch push・マージを対象にしない。直接 push だけで Quality の自動検査が付く設計ではない。

### PR の検査と権限

Quality は checkout、Nix 導入、全 system の Nix 定義評価、固定依存の取得、`bun run check`、`git diff --exit-code` の順に実行する。文書のみの PR も検査し、PNG は保存済みの内容を照合する。

Actions は完全な commit SHA で固定する。token は `contents: read`、checkout は認証情報を保持しない設定とし、`pull_request_target` は使わない。CI は hooks を導入せず、検査コマンドを直接実行する。Release の権限と公開順序は[配布手順](distribution.md#保守者のリリース工程)に定める。

同じ event・ref・runner の古い Quality 実行をキャンセルする。PR、手動実行、異なる OS の検査は互いをキャンセルしない。上限は20分。マージに成功を要求する場合は branch ruleset の必須チェックへ `quality` を設定する。[構成と測定の根拠](research/ci.md)

### OS ごとの確認

Bun、Nix、hooks、OS に依存するライブラリ、端末 I/O、プロセス管理、同梱実行ファイルの変更では Linux と macOS で試験する。PR は Linux を使い、macOS は対象ブランチの手動実行を併用する。

```sh
gh workflow run quality.yml --ref YOUR_BRANCH -f runner=macos-15
```

`YOUR_BRANCH` は対象ブランチに置き換える。Linux の手動実行は `runner=ubuntu-24.04` とする。手動実行は選択ブランチの commit を対象にし、PR のマージ候補とは異なる場合がある。結果には対象 commit と環境を記録する。

## 6. 開発用スキル

AI エージェントは [AGENTS.md](../AGENTS.md)を入口とし、担当範囲に必要なスキルを読む。

| スキル                                                                    | 適用する領域                                       |
| ------------------------------------------------------------------------- | -------------------------------------------------- |
| [hamio-software-design](../.agents/skills/hamio-software-design/SKILL.md) | 入出力、状態遷移、モジュール境界、業務と UI の責務 |
| [hamio-typescript](../.agents/skills/hamio-typescript/SKILL.md)           | 外部入力、状態の型、非同期処理、strict 設定        |
| [hamio-performance](../.agents/skills/hamio-performance/SKILL.md)         | 起動、CPU、メモリ、event 量、並列性、測定条件      |

スキルの判断基準と機械的な検査を併用する。スキルは作業範囲や外部公開の権限を広げない。

## 7. 依存とツールの更新

取得元、差分、lifecycle scripts、lockfile を確認して明示的に更新する。通常の実行には `bunx` などの自動取得を使わない。Bun の版は Nix 入力、同梱ランタイム、`packageManager`、`engines`、型定義、配布 metadata と notices で整合させる。

```sh
bun install --frozen-lockfile --ignore-scripts
nix flake check --all-systems --no-build --no-write-lock-file
bun audit
bun run format
bun run preview
bun run check
```

Node.js は開発ツールが要求する版を使う。`@types/node` は Bun の宣言が参照する依存として `overrides` で固定し、宣言ファイルも検査する。型定義の版を Node.js の実行時 API の保証とみなさない。リポジトリの TypeScript スクリプトは Bun で実行する。

`bun audit` の JavaScript 依存検査に加え、同梱 Bun と native 依存の advisory を確認する。UI・ランタイムの変更では端末、実行ファイル、性能、配布在庫を再評価する。ランタイム修正の利用側への提供は、hamio の新しい製品版として行う。

## 8. ターミナル UI のプレビュー

PTY の実際の出力を記録し、PNG と GIF でレビューする。[プレビュー一覧](previews/README.md)に各画像の対象と確認範囲を示す。

| シナリオ  | 実行するもの                     | 端末サイズ | 確認範囲                                   |
| --------- | -------------------------------- | ---------- | ------------------------------------------ |
| `product` | 製品 CLI の form・stream・render | 80列・28行 | 選択、確認、進捗、秘密値の非表示、結果表   |
| `fixture` | 録画基盤の検証用プログラム       | 80列・20行 | 日本語、色、入力、カーソル更新の記録と描画 |

### 生成と再利用

```sh
./scripts/preview.sh
./scripts/preview.sh --recording
```

既定は PNG、`--recording` は PNG とローカルの GIF・cast を対象にする。生成元と成果物を照合し、不足・変更・破損があれば生成する。`--force` は一致していても再生成する。`bun run preview:check` は読み取り専用の照合を行う。

日常の Nix shell 内で画像が最新なら描画ツールを取得しない。生成が必要なときは preview shell を使う。shell 外では preview shell の準備を含むため、繰り返し生成する場合は `nix develop .#preview` 内で `bun run preview` を使う。

cast は出力と時刻を記録する asciicast、manifest は生成元・成果物の hash を記録する JSON である。

| 成果物                         | 制限と保存                                             |
| ------------------------------ | ------------------------------------------------------ |
| `docs/previews/*.png`          | 1枚512 KiB以下。ソースと同じ commit に含める           |
| `docs/previews/manifest.json`  | PNG の生成元・画像 hash・生成環境。PNG と同時に commit |
| `dist/preview/*.cast`・`*.gif` | 各16 MiB以下。ローカル専用                             |
| `dist/preview/manifest.json`   | 録画と生成元の hash。ローカル専用                      |

生成元は `scripts/preview/**/*.ts`、`scripts/preview*.sh`、`src/**/*`、`examples/**/*.json`、`flake.nix`、`flake.lock`、`package.json`、`bun.lock`。内容の変更だけでなく、追加・削除も照合する。PNG と録画の生成元が異なる場合、`--recording` で録画を生成する。CI はローカル録画を要求しない。

### 目視確認と共有

PNG を画像として開き、日本語、余白、折り返し、色、カーソル更新の残骸を確認する。入力・状態遷移の変更では GIF の操作途中も確認する。ソース、PNG、manifest を一緒にステージする。

PR は[テンプレート](../.github/pull_request_template.md)に沿い、対象 commit に固定した画像を埋め込む。commit・push 後の `git rev-parse HEAD` の完全な SHA で `COMMIT_SHA` を置き換える。

```md
![入力画面](https://raw.githubusercontent.com/9uiLe/hamio/COMMIT_SHA/docs/previews/product-input.png)
![結果画面](https://raw.githubusercontent.com/9uiLe/hamio/COMMIT_SHA/docs/previews/product-result.png)
```

PR の更新時は画像リンクも更新し、シナリオ、確認した状態、未確認の OS・端末を説明する。チャットは確認済み PNG をローカル絶対パスでインライン表示する。GIF の公開は内容確認後に手動で行う。外部録画サービスへの自動送信や cast 全文のチャット転記は行わない。

### シナリオと実行の制限

[scenarios.ts](../scripts/preview/scenarios.ts) にコマンド、端末サイズ、待つ出力、送るキー、撮影位置を定める。期待出力に到達してから入力し、起動速度に撮影位置を依存させない。外部入力ファイルも生成元の照合へ含める。

| モジュール                                      | 責務                               |
| ----------------------------------------------- | ---------------------------------- |
| [generate.ts](../scripts/preview/generate.ts)   | 引数、再利用・生成の選択、出力先   |
| [artifacts.ts](../scripts/preview/artifacts.ts) | 内容照合、サイズ・形式の検証、診断 |
| [capture.ts](../scripts/preview/capture.ts)     | PTY、出力記録、撮影位置、終了判定  |
| [render.ts](../scripts/preview/render.ts)       | 画像化、生成前後の入力源検証、保存 |
| [preview-env.sh](../scripts/preview-env.sh)     | preview 用 Nix shell の準備        |

Bun の PTY が stdout・stderr を記録し、agg が端末命令を描画する。シナリオごとに一つの cast を保持し、撮影位置は event 番号で表す。PNG は一つの Pillow プロセスで変換する。GIF には閲覧用の入力前待機500 msを設け、PNG はこの待機を使わない。

キャプチャと描画は順次実行する。既定上限はキャプチャ15秒、出力1 MiB、10,000 event、描画コマンド60秒。agg の Rayon スレッドプールは2、GIF は10 fpsとする。これらは録画基盤の制限であり、製品の性能予算やプロセス全体のスレッド数とは異なる。

異常終了、不足画面、上限超過、timeout は失敗とする。生成中の入力源の変更も拒否する。ダミーデータと PATH、固定端末・locale、一時 HOME などの限定した環境を使い、`.env` と依存自動取得を無効にする。同じ OS 権限で動くため、未信頼コードの sandbox としては使わない。

内容照合は更新漏れ、目視は見た目を評価する。実端末、画面読み上げ、製品性能はそれぞれの試験で確認する。[プレビューの性能記録](research/preview-performance.md)に測定条件を示す。

## 参照資料

- 検査: [Biome](https://biomejs.dev/guides/getting-started/)、[Prettier](https://prettier.io/docs/cli)、[Husky](https://typicode.github.io/husky/)、[lint-staged](https://github.com/lint-staged/lint-staged)、[Bun install](https://bun.com/docs/pm/cli/install)。
- 端末記録: [Bun PTY](https://bun.com/docs/runtime/child-process#terminal-pty-support)、[asciicast v2](https://docs.asciinema.org/manual/asciicast/v2/)、[agg](https://docs.asciinema.org/manual/agg/usage/)。
