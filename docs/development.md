# hamio 開発手順

hamio は Nix で開発ツールを、Bun の lockfile で JavaScript 依存を固定する。編集時の診断、Git hooks、PR の CI、端末プレビューを使い、実装と UI をローカルから確認する。

本書は環境構築と検査の操作を定める。製品の責務は[基本設計](design.md)、利用側の接続方法は [API 契約](api.md)、内部構成は[実装設計](implementation.md)、実行済みの検証範囲は [README](../README.md) に記載する。

## 1. 対応環境とツール

| OS    | CPU           | Nix system       |
| ----- | ------------- | ---------------- |
| macOS | Apple Silicon | `aarch64-darwin` |
| Linux | ARM64         | `aarch64-linux`  |
| Linux | x86_64        | `x86_64-linux`   |

この表は開発 shell の対象である。製品の配布対象と最低 OS は実行ファイルの試験で別に定める。Intel Mac の shell は、固定した Nixpkgs の[プラットフォーム方針](https://nixos.org/manual/nixpkgs/unstable/release-notes#x86_64-darwin-26.11)に従って提供しない。

| ツール                                                  | 用途                                       | 固定するファイル            |
| ------------------------------------------------------- | ------------------------------------------ | --------------------------- |
| Bun                                                     | TypeScript、依存管理、テスト、ビルド       | `flake.nix` / `flake.lock`  |
| 同梱用 Bun                                              | 製品の実行ファイルに埋め込む公式ランタイム | `flake.nix` / `flake.lock`  |
| Node.js                                                 | 開発用 JavaScript ツール                   | `flake.nix` / `flake.lock`  |
| Git、nixfmt、ShellCheck、shfmt、actionlint              | Git 操作、Nix・Shell・workflow の検査      | `flake.nix` / `flake.lock`  |
| TypeScript、Biome、Prettier、Husky、lint-staged、型定義 | 型検査、Lint、format、Git hooks            | `package.json` / `bun.lock` |
| agg、Python / Pillow、JetBrains Mono、Noto Sans CJK     | 端末出力の画像化                           | `flake.nix` / `flake.lock`  |

`devShells.default` は日常の開発、`devShells.preview` は描画ツールとフォントを加えた画像生成環境とする。ホストへ Bun・Node.js を個別に導入する必要はない。同梱用ランタイムは開発用 Bun と同じ版の公式アーカイブから展開し、Nix 向けの loader 修正を製品へ含めない。

## 2. 初回セットアップ

`nix-command` と `flakes` が有効な Nix を用意する。基準版は CI と同じ Determinate Nix 3.15.1 とする。[公式の導入手順](https://docs.determinate.systems/getting-started/)を参照し、他の Nix 環境では本書のコマンドで互換性を確認する。

リポジトリ直下で実行する。

```sh
./scripts/dev.sh bun run setup
./scripts/dev.sh bun run check
```

`setup` は `bun install --frozen-lockfile --ignore-scripts` で依存を取得し、この clone に Git hooks を導入する。依存宣言と lockfile が不一致なら失敗し、パッケージの lifecycle scripts は実行しない。`core.hooksPath` が `.husky/_` 以外を指す場合は上書きせず、開発者が既存の hooks と統合する。

セットアップは clone ごとに行う。`nix develop` は shell を開く操作で、依存取得と Git 設定の変更は行わない。Nix store に不足するツールの取得にはネットワークとディスク容量が必要となる。binary cache は Nix 公式の `cache.nixos.org` を基準とし、リポジトリから別の cache や署名鍵を登録しない。署名検証を有効に保つ。

## 3. 日常の開発と検査

### 製品を実行する

開発用 shell を開き、ソースまたは同梱実行ファイルから製品を呼び出す。

```sh
nix develop
bun run hamio --help
bun run build
./dist/hamio capabilities
sh examples/form.sh
```

`build` はホストの OS・CPU 向けに `dist/hamio` を生成する。Nix shell が同梱用ランタイムを `HAMIO_BUN_RUNTIME` へ設定し、ビルドへ渡す。生成後の UI 利用に Bun・Node.js・Nix は不要である。公開リリースや署名はこのコマンドで行わない。

圧縮した配布候補は `bun run package` でビルドし、`dist/hamio.gz` に保存する。受け取り側は `gzip -dc hamio.gz > hamio` と `chmod +x hamio` で展開する。圧縮は転送量を減らすための工程で、通常の build・check には含めない。

Python の例は利用側の Python 環境で `python3 examples/form.py` を実行する。hamio は利用側の言語ランタイムを提供しない。

### 編集から全体検査まで

対象の型診断とテストを使いながら編集する。format の差分を確認し、UI またはプレビューの生成元を変更した場合は画像を用意して目視確認する。作業完了前には全体検査を通す。

```sh
bun run format
# UI またはプレビュー生成元を変更した場合
bun run preview
bun run check
```

| コマンド                                | 用途                                                   |
| --------------------------------------- | ------------------------------------------------------ |
| `bun run lint`                          | Biome、ShellCheck、actionlint                          |
| `bun run lint:fix`                      | Biome が安全と分類する Lint 修正を適用                 |
| `bun run format`                        | format の自動修正                                      |
| `bun run format:check`                  | format の読み取り専用検査                              |
| `bun run typecheck` / `typecheck:watch` | strict 型検査 / 変更監視                               |
| `bun run test` / `test:watch`           | テスト / 変更監視                                      |
| `bun run check:staged`                  | ステージ済みファイルの検査                             |
| `bun run preview`                       | 最新の PNG を用意し、必要なら録画・描画                |
| `bun run preview:check`                 | 生成元と PNG の読み取り専用照合                        |
| `bun run check`                         | Lint、format、型検査、テスト、プレビュー照合を順に実行 |

shell 外からは `./scripts/dev.sh bun run check` のように呼び出す。引数なしの `./scripts/dev.sh` も全体検査を実行する。Git hooks はこの入口を使うため、GUI の PATH に Bun・Node.js がなくても Nix 環境で検査できる。Nix が見つからない場合は失敗する。

全体検査は最初の失敗で停止し、ソースを自動修正しない。診断に従って編集・修正し、差分を確認して再検査する。検査を通すためにルール、型検査、hooks を無効化しない。

### エディタと検査対象

VS Code の推奨拡張と設定は `.vscode/` に置く。Biome と Prettier が保存時 format を担当する。[TypeScript 7 拡張](https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.native-preview)は `node_modules/typescript` を参照し、CLI と同じ版を使う。拡張は開発者が導入する。他のエディタでも固定したローカルツールを使用する。

| 対象           | 検査                             | format            |
| -------------- | -------------------------------- | ----------------- |
| TS・JS         | Biome。TS は宣言ファイルも型検査 | Biome             |
| JSON・JSONC    | Biome                            | Biome             |
| Markdown       | 内容、リンク、format             | Prettier          |
| YAML・workflow | format、workflow は actionlint   | Prettier          |
| Nix            | 定義評価                         | nixfmt            |
| Shell・hooks   | ShellCheck                       | shfmt             |
| プレビュー     | 生成元・画像の照合、目視確認     | manifest は Biome |

自動検査の範囲は [package.json](../package.json) と [.lintstagedrc.json](../.lintstagedrc.json)に定める。文書の内容とリンクはレビューで確認する。Nix 定義を変更した場合は追加で次を実行する。

```sh
nix flake check --all-systems --no-build --no-write-lock-file
```

このコマンドは全 system の定義評価を行う。各 OS での実行試験とは異なり、`bun run check` には含まれない。

### 製品試験と性能測定

`bun test` は契約、実際の CLI、疑似端末である PTY、同梱実行ファイルを検証する。ビルド試験は `dist/hamio` を生成し、Bun のない PATH と暗黙設定ファイルのあるディレクトリで実行する。[runtime.test.ts](../tests/runtime.test.ts) は入出力を差し替え、同時呼び出し、event の順序・排出、遅い出力、描画の寿命を検証する。試験と各層の関係は[実装設計](implementation.md#10-検証の構成)に定める。

性能は配布候補をビルドしてから測る。開発用 TS の直接実行、プレビュー生成、製品の起動・処理は別の測定対象とする。

| 測定               | スクリプト                      | 対象                                                                 |
| ------------------ | ------------------------------- | -------------------------------------------------------------------- |
| 一つの実行ファイル | `scripts/benchmark-api.ts`      | 機械向けコマンドの起動、CPU、maxRSS、出力量                          |
| 二つの実行ファイル | `scripts/benchmark-refactor.ts` | 同一入力の交互実行による処理時間・資源使用量・サイズ・PTY 応答の比較 |

一つの実行ファイルを測る場合は、次を実行する。

```sh
bun run build
bun scripts/benchmark-api.ts dist/benchmarks/api.json 30
```

二つの実行ファイルを比較する場合は、対照を「基準版」、作業中の実装を「評価版」とする。基準版は対象 commit を別の作業ディレクトリでビルドし、実行ファイルを `dist/refactor/baseline-hamio` に保存する。比較には同じ Nix 入力とランタイム・ビルド設定を使い、依存の差は lockfile とともに記録する。

評価版をビルドして次を実行する。最後の引数 `BASELINE_COMMIT_SHA` は基準版の完全な commit SHA に置き換える。

```sh
bun run build
bun scripts/benchmark-refactor.ts dist/refactor/comparison.json dist/refactor/baseline-hamio dist/hamio 30 BASELINE_COMMIT_SHA
```

各条件・各版で2回ずつ warmup し、30組の測定で実行順を交互に切り替える。ソースや実行ファイルが測定中に変わった場合、または pipe の出力が版・試行間で異なる場合は失敗する。この比較は同じ出力契約を持つ版に使う。

計測中は別の build・テスト・ベンチマークを走らせない。条件、入力 hash、ソースと生成物の hash、生データを保存する。OS・CPU・RAM・Bun 版・測定 API・単位を添え、中央値と p95、改善と悪化、未測定の範囲を記録する。通常の check・hooks・PR の CI ではベンチマークを実行しない。

測定記録の例は[製品 API の性能評価](research/api-performance.md)と[実行基盤の性能比較](research/refactor-performance.md)を参照する。異なるソースや環境の値を同一条件として扱わず、試験成功だけで全性能予算の達成を判断しない。

## 4. Git hooks

Husky が hook の実行を管理し、検査範囲を分担する。

| hook       | 対象                 | 動作                                                                        |
| ---------- | -------------------- | --------------------------------------------------------------------------- |
| pre-commit | ステージ済みファイル | lint-staged で検査。同時タスクは2。部分ステージの未ステージ部分を退避・復元 |
| pre-push   | 作業ツリー全体       | `bun run check` で型、テスト、プレビューも検査                              |

hooks はソースを自動修正しない。失敗後は修正の差分を確認して再ステージする。pre-push は未コミットの内容も検査するため、検査対象と送信する commit が異なる場合がある。GitHub 上のマージ候補は PR の CI で検証する。

ローカル hooks は回避可能であり、強制的なマージ条件は GitHub の branch ruleset で管理する。hooks 自体の試験は一時 Git リポジトリで、不正な commit・push の拒否、部分ステージの復元、正常系、既存 hooks 設定の保護を確認する。

## 5. GitHub Actions

[Quality workflow](../.github/workflows/quality.yml)は、`master` 向け PR の `opened`、`synchronize`、`reopened` で自動起動する。実行者はリポジトリ所有者、PR の送信元は同一リポジトリに限定する。push と PR close はトリガーに含めない。直接 push した commit には自動検査が付かない。

### 検査ジョブ

通常の PR は `ubuntu-24.04` の `quality` ジョブで次を実行する。

1. コードを checkout し、固定した Nix を導入する。
2. 全 system の Nix 定義を評価する。
3. Nix shell で `bun install --frozen-lockfile --ignore-scripts` を実行する。
4. 同じ shell で `bun run check` を実行する。
5. `git diff --exit-code` で追跡ファイルが変更されていないことを確認する。

CI は commit 済みの PNG と生成元を照合し、画像を生成しない。文書だけの PR も format の対象とする。ジョブ構成と準備時間の評価は[CI の構成と測定](research/ci.md)に記録する。

Actions は完全な commit SHA、Nix インストーラーは版で固定する。`pull_request_target` を使わず、トークンは読み取り権限とし、checkout 後に認証情報を保持しない。CI では hooks を導入せず検査コマンドを直接実行する。

同じ event・ref・runner の古い実行はキャンセルする。PR と手動実行、異なる OS の手動実行は互いをキャンセルしない。ジョブの上限は20分。マージに検査成功を要求する場合は、branch ruleset で `quality` を必須チェックに設定する。

### OS ごとの確認

Bun・Nix・hooks・OS に関わる依存、端末 I/O、プロセス管理、同梱実行ファイルを変更する場合は、Linux と macOS の両方で同じ試験を実行する。通常の PR は Linux を担当し、macOS は対象ブランチを指定して手動実行する。

```sh
gh workflow run quality.yml --ref YOUR_BRANCH -f runner=macos-15
```

`YOUR_BRANCH` を検証するブランチ名に置き換える。Actions の `Run workflow` からもブランチと runner を選べる。Linux の手動確認は `runner=ubuntu-24.04` を指定する。

手動実行は選択ブランチの commit を検証し、PR のマージ候補とは異なる場合がある。コードを更新したら必要な OS の試験を再実行する。Nix 定義の評価成功だけを製品の動作保証に使わない。

## 6. 開発用スキル

AI エージェントは [AGENTS.md](../AGENTS.md) の作業規則に従い、必要な領域のスキルを読む。

| スキル                                                                    | 対象                                               |
| ------------------------------------------------------------------------- | -------------------------------------------------- |
| [hamio-software-design](../.agents/skills/hamio-software-design/SKILL.md) | 入出力、状態遷移、モジュール境界、業務と UI の責務 |
| [hamio-typescript](../.agents/skills/hamio-typescript/SKILL.md)           | 境界検証、状態の型表現、非同期処理、strict 設定    |
| [hamio-performance](../.agents/skills/hamio-performance/SKILL.md)         | 起動、CPU、メモリ、event 量、並列性、測定条件      |

スキルは設計と判断を支援し、機械的な検査と併用する。作業範囲や外部への公開権限は依頼された範囲に従う。

## 7. 依存とツールの更新

取得元、コード差分、lifecycle scripts、lockfile を確認し、`flake.lock` と `bun.lock` を明示的に更新する。通常の実行に `bunx` などの自動取得を持ち込まない。

Bun の版は Nix 入力、同梱ランタイム、`packageManager`、`engines`、型定義で整合させる。Node.js は開発ツールが要求する版を使う。更新した lockfile で次を実行する。

```sh
bun install --frozen-lockfile --ignore-scripts
nix flake check --all-systems --no-build --no-write-lock-file
bun run format
bun run preview
bun run check
```

`@types/node` は Bun の型定義が参照する依存として `overrides` で固定する。Bun 1.4.2 の宣言に必要な型を含む26.6.1を使い、宣言ファイルも検査する。この型定義は開発用 Node.js 24 の実行時 API を保証しない。リポジトリの TypeScript スクリプトは Bun で実行する。

`bun audit` は既知の脆弱性の補助検査に使う。同梱ランタイムの更新と公開資産の検証は[基本設計](design.md)の方針に従い、UI 依存とランタイムを変えた場合は端末・実行ファイル・性能も再評価する。

## 8. ターミナル UI のプレビュー

プレビューは実際の PTY 出力を PNG と GIF に変換する開発機能である。[プレビュー一覧](previews/README.md)では確認対象を次のように分ける。

| シナリオ  | 実行対象                         | 端末サイズ | 確認する内容                               |
| --------- | -------------------------------- | ---------- | ------------------------------------------ |
| `product` | 製品 CLI の form・stream・render | 80列・28行 | 選択、確認、進捗、秘密値の非表示、結果表   |
| `fixture` | 録画基盤の検証用プログラム       | 80列・20行 | 日本語、色、入力、カーソル更新の記録・描画 |

### 画像と録画を用意する

リポジトリ直下で実行する。Nix shell の外からも使える。

```sh
./scripts/preview.sh
# 操作途中も確認する場合
./scripts/preview.sh --recording
```

| 操作                          | 動作                                                       |
| ----------------------------- | ---------------------------------------------------------- |
| `bun run preview`             | PNG が最新なら再利用し、不足・変更・破損があれば録画・描画 |
| `bun run preview --recording` | PNG とローカルの GIF・cast を照合し、必要なら生成          |
| `bun run preview --force`     | 一致していても PNG を再生成。`--recording` と併用可能      |
| `bun run preview:check`       | 読み取り専用で更新漏れを検出                               |

既定の shell 内では画像が最新なら描画ツールを追加取得しない。生成が必要な場合は preview shell を読み込む。shell 外からは preview shell の準備も含み、Nix store にないツールとフォントを取得する。

UI を繰り返し編集する場合は `nix develop .#preview` を開いたまま `bun run preview` を使い、毎回の Nix 起動時間を省く。

### 生成物と更新漏れの検出

cast は端末出力と時刻を記録する asciicast ファイル、manifest は生成元・生成物の SHA-256 を記録する JSON ファイルである。

| 出力                          | 内容                                 | Git 管理            |
| ----------------------------- | ------------------------------------ | ------------------- |
| `docs/previews/*.png`         | 代表状態の画像。1枚512 KiB以下       | ソースと同じ commit |
| `docs/previews/manifest.json` | PNG の生成元・画像の hash と生成環境 | PNG と同じ commit   |
| `dist/preview/*.cast`         | 端末出力と時刻                       | 対象外              |
| `dist/preview/*.gif`          | 操作録画                             | 対象外              |
| `dist/preview/manifest.json`  | 録画の生成元・GIF・cast の hash      | 対象外              |

次の生成元の内容と追加・削除を照合する。

- `scripts/preview/**/*.ts` と `scripts/preview*.sh`
- `src/**/*` と `examples/**/*.json`
- `flake.nix`、`flake.lock`、`package.json`、`bun.lock`

format と依存設定の変更も生成元の変更になる。照合に失敗した場合は対象と再生成コマンドを表示する。画像を確認し、PNG と manifest をソースと一緒にステージする。

GIF と cast は各16 MiBを上限とし、ローカル専用の manifest で照合する。PNG の生成で cast が更新されて録画用 manifest と不一致になった場合、次の `--recording` で録画を生成する。CI はローカルの録画を要求しない。

### 目視確認と共有

PNG を画像として開き、日本語、余白、折り返し、色、カーソル更新の残骸を確認する。入力と状態遷移の変更では GIF の操作途中も確認する。内容の照合は更新漏れを検出し、目視確認は表示の正しさを確認する。

PR には[テンプレート](../.github/pull_request_template.md)の欄に画像を埋め込む。PNG と manifest を commit・push した後、`git rev-parse HEAD` の値を次の `COMMIT_SHA` に指定する。

```md
![入力画面](https://raw.githubusercontent.com/9uiLe/hamio/COMMIT_SHA/docs/previews/product-input.png)
![結果画面](https://raw.githubusercontent.com/9uiLe/hamio/COMMIT_SHA/docs/previews/product-result.png)
```

PR の更新時は画像リンクの SHA も更新し、シナリオ、確認状態、未確認の OS・端末を添える。チャットには確認した PNG をローカル絶対パスでインライン表示する。

録画は公開資料として内容を確認し、実際の秘密情報を含めない。GIF を PR に添付する場合は確認後に手動でアップロードする。外部録画サービスへ自動送信せず、AI エージェントは `.cast` 全文をチャットへ転記しない。

### シナリオと内部構成

[scenarios.ts](../scripts/preview/scenarios.ts)に実行コマンド、端末サイズ、待つ出力、送るキー、撮影位置を定義する。期待する出力へ到達してから入力を送り、起動速度に撮影時刻を依存させない。通常・エラー・キャンセルなど変更対象を最小のダミーデータで再現し、外部ファイルの入力も `sourceHashes` の照合対象へ含める。

| ファイル                                        | 責務                                                   |
| ----------------------------------------------- | ------------------------------------------------------ |
| [generate.ts](../scripts/preview/generate.ts)   | 引数、再利用と生成の選択、出力パスの案内               |
| [artifacts.ts](../scripts/preview/artifacts.ts) | 生成元・生成物の照合、サイズ・形式検証、更新対象の診断 |
| [capture.ts](../scripts/preview/capture.ts)     | PTY の実行、入出力の記録、撮影位置、終了判定           |
| [render.ts](../scripts/preview/render.ts)       | 画像化、生成前後の入力源検証、生成物の保存             |
| [preview-env.sh](../scripts/preview-env.sh)     | preview 用 Nix shell の準備                            |

Bun の PTY で stdout・stderr を記録し、agg が ANSI とカーソル操作を解釈する。シナリオごとに一つの cast を保持し、撮影位置は event 番号で指定する。PNG の変換は一つの Pillow プロセスで行う。

PNG では入力前の閲覧用待機を設けず、GIF では500 ms待つ。期待する出力の待機とシナリオ自体の処理は両形式で実行する。

### 資源上限と安全性

キャプチャと描画は順次実行する。キャプチャの既定上限は15秒、出力1 MiB、10,000 event、描画コマンドは60秒とする。agg の Rayon スレッドプールは2、GIF は10 fps。これらはプロセス全体のスレッド数や製品 API の性能予算とは別の制限である。

異常終了、不足画面、出力超過、timeout は失敗とする。生成前後で入力源を照合し、処理中に変化した場合は生成物を採用しない。子プロセスには PATH、固定した端末・locale、一時 HOME などの限定した環境だけを渡し、Bun の `.env` 読み込みと依存の自動取得を無効にする。同じ OS 権限で動くため、未信頼コードの sandbox には使わない。

固定した端末エミュレーターの描画だけでは、各 OS の実端末、画面読み上げ、製品性能は保証しない。開発用プレビューの速度と資源使用量は[プレビューの性能評価](research/preview-performance.md)に記録し、通常の検査と hooks ではベンチマークを実行しない。

## 参照資料

- 設定: [flake.nix](../flake.nix)、[package.json](../package.json)、[tsconfig.json](../tsconfig.json)、[biome.json](../biome.json)。
- 検査ツール: [Biome](https://biomejs.dev/guides/getting-started/)、[Prettier CLI](https://prettier.io/docs/cli)、[Husky](https://typicode.github.io/husky/)、[lint-staged](https://github.com/lint-staged/lint-staged)、[Bun install](https://bun.com/docs/pm/cli/install)、[Git hooks](https://git-scm.com/docs/githooks)。
- 端末記録: [Bun PTY](https://bun.com/docs/runtime/child-process#terminal-pty-support)、[asciicast v2](https://docs.asciinema.org/manual/asciicast/v2/)、[agg](https://docs.asciinema.org/manual/agg/usage/)。
