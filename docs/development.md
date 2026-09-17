# 開発環境と検査

hamio の開発には、Nix で固定した実行環境と Bun の lockfile に基づく依存を使用する。編集時の診断、Git hooks、PR の CI、端末プレビューを組み合わせ、コードと UI をローカルから確認する。

本書は環境構築と日常の作業手順の正本である。製品の責務と公開契約は[基本設計](design.md)、実装済みの範囲は [README](../README.md) に記載する。

## 1. 対応環境とツール

開発用 Nix shell は次の環境を対象とする。

| OS    | CPU           | Nix system       |
| ----- | ------------- | ---------------- |
| macOS | Apple Silicon | `aarch64-darwin` |
| Linux | ARM64         | `aarch64-linux`  |
| Linux | x86_64        | `x86_64-linux`   |

Intel Mac 用 shell は提供しない。固定した Nixpkgs の[プラットフォーム方針](https://nixos.org/manual/nixpkgs/unstable/release-notes#x86_64-darwin-26.11)に従う。製品の配布対象は実行ファイルの実機検証で別に定める。

| ツール                                                  | 用途                                  | 固定するファイル            |
| ------------------------------------------------------- | ------------------------------------- | --------------------------- |
| Bun                                                     | TypeScript、依存管理、テスト          | `flake.nix` / `flake.lock`  |
| Node.js                                                 | 開発用 JavaScript ツールの実行        | `flake.nix` / `flake.lock`  |
| Git、nixfmt、ShellCheck、shfmt、actionlint              | Git 操作、Nix・Shell・workflow の検査 | `flake.nix` / `flake.lock`  |
| TypeScript、Biome、Prettier、Husky、lint-staged、型定義 | 型検査、Lint、format、Git hooks       | `package.json` / `bun.lock` |
| agg、Python / Pillow、JetBrains Mono、Noto Sans CJK     | 端末出力の画像化                      | `flake.nix` / `flake.lock`  |

`devShells.default` は日常の開発と検査、`devShells.preview` は画像生成に使用する。preview shell は既定のツールに描画ツールとフォントを加えた環境である。Bun・Node.js をホストへ個別に導入する必要はない。開発用の依存は製品の配布物に含めない。

## 2. 初回セットアップ

`nix-command` と `flakes` が有効な Nix を用意する。基準版は CI と同じ Determinate Nix 3.15.1 とする。[公式の導入手順](https://docs.determinate.systems/getting-started/)を参照する。他の Nix 環境を使う場合は、本書のコマンドで互換性を確認する。

リポジトリ直下で実行する。

```sh
./scripts/dev.sh bun run setup
./scripts/dev.sh bun run check
```

`setup` は `bun install --frozen-lockfile --ignore-scripts` で依存を取得し、この clone に Git hooks を導入する。依存宣言と lockfile が不一致なら失敗し、パッケージの lifecycle scripts は実行しない。`core.hooksPath` が `.husky/_` 以外を指す場合は上書きせず、開発者が hooks を統合する。

セットアップは clone ごとに行う。`nix develop` は shell を開く操作であり、JS 依存の取得や Git 設定の変更は行わない。

Nix store に不足するツールの取得にはネットワークとディスク容量を必要とする。binary cache の基準は Nix 公式の `cache.nixos.org` とし、リポジトリから別の cache や署名鍵を登録しない。署名検証を有効に保ち、ローカル固有の設定は開発者が管理する。

## 3. 日常の開発と検査

開発用 shell に入り、編集、format、対象のテストを実行する。UI またはプレビューの生成元を変更した場合は、format の後にプレビューを用意して画像を確認する。作業の完了前に全体検査を通す。

```sh
nix develop
bun run format
# UI の確認が必要な場合
bun run preview
bun run check
```

| コマンド                  | 用途                                                                 |
| ------------------------- | -------------------------------------------------------------------- |
| `bun run lint`            | Biome、ShellCheck、actionlint による検査                             |
| `bun run lint:fix`        | Biome が安全と分類する Lint 修正の適用                               |
| `bun run format`          | format の自動修正                                                    |
| `bun run format:check`    | format の読み取り専用検査                                            |
| `bun run typecheck`       | strict TypeScript 検査                                               |
| `bun run typecheck:watch` | 型検査の変更監視                                                     |
| `bun run test`            | テストの実行                                                         |
| `bun run test:watch`      | テストの変更監視                                                     |
| `bun run check:staged`    | ステージ済みファイルの検査                                           |
| `bun run preview`         | 最新のプレビューを用意する。必要な場合に録画・描画を実行する         |
| `bun run preview:check`   | 生成元と PNG の内容を読み取り専用で照合する                          |
| `bun run check`           | Lint、format、型検査、テスト、プレビューの更新漏れ検査を順に実行する |

shell 外からは `./scripts/dev.sh bun run check` のように呼び出す。引数なしの `./scripts/dev.sh` も全体検査を実行する。Git hooks はこの入口を使うため、GUI の PATH に Bun・Node.js がなくても Nix 環境で検査できる。Nix が見つからなければ失敗する。

全体検査は最初の失敗で停止し、ソースを自動修正しない。診断に応じて編集または修正用コマンドを実行し、差分を確認して再検査する。検査を通すためにルール、型検査、hooks を無効化しない。

### エディタとファイル別の規則

VS Code の推奨拡張と設定は `.vscode/` に置く。Biome が TS・JS・JSON、Prettier が Markdown・YAML の保存時 format を担当する。[TypeScript 7 拡張](https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.native-preview)は `node_modules/typescript` を参照し、CLI と同じ版を使用する。拡張は開発者が導入する。他のエディタでも固定したローカルツールを使用する。

| 対象           | 検査                                        | format                    |
| -------------- | ------------------------------------------- | ------------------------- |
| TS・JS         | Biome。TS は宣言ファイルを含めて型検査する  | Biome                     |
| JSON・JSONC    | Biome                                       | Biome                     |
| Markdown       | 内容、参照先、format                        | Prettier                  |
| YAML・workflow | format。workflow は actionlint でも検査する | Prettier                  |
| Nix            | 定義評価                                    | nixfmt                    |
| Shell・hooks   | ShellCheck                                  | shfmt                     |
| プレビュー     | 生成元・画像の内容照合、目視確認            | manifest の JSON は Biome |

検査範囲は [package.json](../package.json) と[ステージ済みファイルの規則](../.lintstagedrc.json)に定義する。Nix 定義を変更した場合は、全体検査に加えて次を実行する。

```sh
nix flake check --all-systems --no-build --no-write-lock-file
```

このコマンドは全 system の定義を評価する。各 OS の実行試験とは別であり、`bun run check` には含まれない。

## 4. Git hooks

Husky が hooks の実行を管理し、commit 前と push 前で検査範囲を分担する。

| hook       | 検査対象                   | 動作                                                                                |
| ---------- | -------------------------- | ----------------------------------------------------------------------------------- |
| pre-commit | ステージ済みの対象ファイル | lint-staged で検査する。同時タスクは2。部分ステージの未ステージ部分を退避・復元する |
| pre-push   | 作業ツリー全体             | `bun run check` で型、テスト、プレビューを含めて検査する                            |

hooks はソースを自動修正しない。失敗したら修正し、差分を確認して再ステージする。pre-push は未コミットの内容も検査するため、送信する commit と検査済みの作業ツリーが異なる場合がある。GitHub 上のマージ候補は PR の CI で検証する。

ローカル hooks は回避可能である。GitHub 上の強制的なマージ条件には branch ruleset を使用する。

hooks のテストは一時 Git リポジトリ内で実行し、不正な commit・push の拒否、部分ステージの復元、正常系、他の hooks 設定の保護を確認する。

## 5. GitHub Actions

[Quality workflow](../.github/workflows/quality.yml)の自動トリガーは、`master` 向け PR の `opened`、`synchronize`、`reopened` とする。実行者はリポジトリ所有者、PR の送信元は同一リポジトリに限定する。push と PR close では起動しないため、直接 push した commit には自動検査が付かない。

### 検査ジョブ

通常の PR は `ubuntu-24.04` の `quality` ジョブで検査する。

1. 対象コードを checkout し、固定した Nix を導入する。
2. `nix flake check --all-systems --no-build --no-write-lock-file` で定義を評価する。
3. Nix shell 内で `bun install --frozen-lockfile --ignore-scripts` を実行する。
4. 依存取得に成功したら、同じ shell で `bun run check` を実行する。
5. `git diff --exit-code` で追跡対象ファイルに変更がないことを確認する。

画像は生成せず、commit された PNG と生成元の一致を検査する。文書だけの PR も format の対象とする。ジョブ構成の根拠は[CI の構成と測定](research/ci.md)に記載する。

Actions は完全な commit SHA、Nix インストーラーは版を固定する。`pull_request_target` は使わない。トークンは読み取り権限とし、checkout 後に認証情報を保持しない。CI では hooks を導入せず、検査コマンドを直接実行する。

同じ event・ref・runner の古い実行はキャンセルする。PR と手動実行、異なる OS の手動実行は互いをキャンセルしない。ジョブの上限は20分とする。検査成功をマージ条件にする場合は、branch ruleset で `quality` を必須チェックに設定する。

### OS ごとの確認

Bun・Nix・hooks・OS に関わる依存を変更する場合は、マージ前に macOS でも検査する。Actions の `Run workflow` でブランチと `runner: macos-15` を選ぶか、次を実行する。

```sh
gh workflow run quality.yml --ref YOUR_BRANCH -f runner=macos-15
```

`YOUR_BRANCH` は確認するブランチ名に置き換える。手動実行は選択ブランチの commit を検証するため、PR のマージ候補とは異なる場合がある。対象コードを更新したら必要な OS の検査を再実行する。Linux の手動確認には `runner=ubuntu-24.04` を指定する。

通常の PR 検査に macOS 固有の動作確認は含まれない。製品の端末 I/O、プロセス管理、配布物には、両 OS で実行する自動テストを設計する。

## 6. 開発用スキル

AI エージェントの作業規則は [AGENTS.md](../AGENTS.md)、領域別の判断基準は `.agents/skills` に置く。作業対象に必要なスキルを選び、設計、契約、測定条件の判断に使う。

| スキル                                                                    | 対象                                               |
| ------------------------------------------------------------------------- | -------------------------------------------------- |
| [hamio-software-design](../.agents/skills/hamio-software-design/SKILL.md) | 入出力、状態遷移、モジュール境界、業務と UI の責務 |
| [hamio-typescript](../.agents/skills/hamio-typescript/SKILL.md)           | 境界検証、状態の型表現、非同期処理、strict 設定    |
| [hamio-performance](../.agents/skills/hamio-performance/SKILL.md)         | 起動、CPU、メモリ、event 量、並列性、測定条件      |

スキルは作業範囲や公開権限を広げるものではない。通常の検査成功と、製品の動作・性能の検証結果は区別する。

## 7. 依存とツールの更新

依存を追加・更新する場合は、取得元、コード差分、lifecycle scripts、lockfile を確認する。`flake.lock` と `bun.lock` は明示的に更新する。通常の実行に `bunx` などの自動取得を持ち込まない。

Bun の版は Nix 定義、`packageManager`、`engines`、型定義で整合させる。Node.js は開発ツールが要求する版を使う。更新を記録した lockfile で次を実行する。

```sh
bun install --frozen-lockfile --ignore-scripts
nix flake check --all-systems --no-build --no-write-lock-file
bun run format
bun run preview
bun run check
```

`@types/node` は Bun の型定義が参照する依存として `overrides` で固定する。Bun 1.4.2 の宣言に必要な型を含む26.6.1を使用し、宣言ファイルも型検査する。この型定義は開発用 Node.js 24 の実行時 API を保証しない。リポジトリの TypeScript スクリプトは Bun で実行する。

`bun audit` は既知の脆弱性を調べる補助検査とする。製品に同梱するランタイムの更新と配布検証は[基本設計](design.md)に従う。

## 8. ターミナル UI のプレビュー

プレビューは、疑似端末で実行した出力を PNG と GIF に変換し、PR とチャットで確認する開発機能である。代表画像は[プレビュー一覧](previews/README.md)に置く。

`fixture` は日本語、色、入力、カーソル更新を扱う録画基盤の検証用プログラムである。製品の UI や公開 API は含まない。製品の表示を確認するシナリオは製品の入口を直接実行する。

### 画像を用意する

リポジトリ直下で次を実行する。Nix shell の外からも使える。

```sh
./scripts/preview.sh
# 操作途中も確認する場合
./scripts/preview.sh --recording
```

| 操作                          | 動作                                                                   |
| ----------------------------- | ---------------------------------------------------------------------- |
| `bun run preview`             | PNG が最新なら再利用し、未生成・変更・破損があれば録画と描画を実行する |
| `bun run preview --recording` | PNG とローカルの GIF・cast を検証し、必要ならまとめて生成する          |
| `bun run preview --force`     | 内容が一致していても PNG を生成する。`--recording` と併用できる        |
| `bun run preview:check`       | 更新漏れだけを検出する。生成やファイルの書き換えは行わない             |

既定の開発 shell 内では、画像が最新なら描画ツールの追加取得は不要である。生成が必要な場合は preview shell を読み込む。shell 外からの起動は preview shell の準備を含み、Nix store にないツールとフォントを取得する。

UI を繰り返し編集するときは、次の shell を開いたまま作業する。

```sh
nix develop .#preview
bun run preview
```

これにより、画像の確認ごとに Nix へ入場する時間を省ける。

### 生成物と最新性

cast は端末出力と時刻を記録する asciicast ファイル、manifest は生成元・生成物の SHA-256 を記録する JSON ファイルである。

| 出力                          | 内容                                 | Git 管理                     |
| ----------------------------- | ------------------------------------ | ---------------------------- |
| `docs/previews/*.png`         | 代表状態の静止画。1枚512 KiB以下     | ソースと同じ commit に含める |
| `docs/previews/manifest.json` | PNG の生成元・画像の hash と生成環境 | PNG と同じ commit に含める   |
| `dist/preview/*.cast`         | 端末出力と時刻の記録                 | 対象外                       |
| `dist/preview/*.gif`          | 操作録画                             | 対象外                       |
| `dist/preview/manifest.json`  | 録画の生成元・GIF・cast の hash      | 対象外                       |

PNG の生成元として、次のファイルの内容と追加・削除を検査する。

- `scripts/preview/**/*.ts` と `scripts/preview*.sh`
- `src/**/*`
- `flake.nix`、`flake.lock`、`package.json`、`bun.lock`

再利用は生成元と生成物の内容で判断する。format や開発用の依存設定も生成元の変更となる。更新チェックの失敗では対象と再生成コマンドを表示する。PNG を確認してから、画像と manifest をソースと一緒にステージする。

GIF と cast はローカル専用の manifest で検証し、1ファイル16 MiBを上限とする。PNG だけの生成で cast が更新されると録画用 manifest と不一致になり、次の `--recording` で録画を生成する。CI は版管理された PNG と manifest を検査し、ローカル録画を要求しない。

### 目視確認と共有

PNG を画像として開き、日本語、余白、折り返し、色、カーソル更新の残骸を確認する。入力や状態遷移を扱う変更では GIF の操作途中も確認する。内容の照合は目視確認を代替しない。各 OS の実端末、画面読み上げ、製品性能は専用の試験で検証する。

[PR テンプレート](../.github/pull_request_template.md)の UI プレビュー欄に画像を埋め込む。PNG と manifest を commit・push した後、`git rev-parse HEAD` の結果を `COMMIT_SHA` に指定する。

```md
![入力画面](https://raw.githubusercontent.com/9uiLe/hamio/COMMIT_SHA/docs/previews/fixture-input.png)
![結果画面](https://raw.githubusercontent.com/9uiLe/hamio/COMMIT_SHA/docs/previews/fixture-result.png)
```

PR の画像リンクは確認対象の commit に固定し、PR を更新したらリンクも更新する。シナリオ、確認した状態、未確認の OS・端末を添える。チャットには同じ PNG をローカルの絶対パスでインライン表示する。

録画は公開資料として内容を確認する。AI エージェントは `.cast` 全文をチャットへ転記しない。GIF を PR に添付する場合は、内容を確認して手動でアップロードする。外部録画サービスへ自動送信しない。

### シナリオと内部構成

[scenarios.ts](../scripts/preview/scenarios.ts)には実行コマンド、端末サイズ、待つ出力、送るキー、撮影する状態を定義する。基準サイズは80列・20行とする。期待する出力へ到達してから入力を送り、起動速度に依存した撮影を避ける。

通常、エラー、キャンセルなど、変更対象を最小のダミーデータで再現する。シナリオが別ファイルからデータを読む場合は、その入力も `sourceHashes` の照合対象に含める。

| ファイル                                        | 責務                                                   |
| ----------------------------------------------- | ------------------------------------------------------ |
| [generate.ts](../scripts/preview/generate.ts)   | 引数の受け付け、再利用と生成の選択、出力パスの案内     |
| [artifacts.ts](../scripts/preview/artifacts.ts) | 生成元・生成物の照合、サイズ・形式検証、更新対象の診断 |
| [capture.ts](../scripts/preview/capture.ts)     | PTY の実行、入力と出力の記録、撮影位置の管理、終了判定 |
| [render.ts](../scripts/preview/render.ts)       | 画像化、生成前後の入力源検証、生成物の保存             |
| [preview-env.sh](../scripts/preview-env.sh)     | preview 用 Nix shell の用意                            |

Bun の PTY で stdout・stderr を記録し、agg が ANSI とカーソル操作を解釈する。シナリオの出力は一つの cast として保持し、撮影位置は event 番号で指定する。PNG の変換は一つの Pillow プロセスで行う。

PNG では入力前の閲覧用待機を設けず、GIF では500 ms待つ。期待する出力の待機とシナリオ自体の処理は両形式で実行する。

### 資源上限と安全性

キャプチャと描画は順次実行する。キャプチャの既定上限は15秒、出力1 MiB、10,000 event、描画コマンドの上限は60秒とする。agg の Rayon スレッドプールは2、GIF は10 fpsに設定する。これらはプロセス全体のスレッド数の上限や製品の性能予算とは異なる。

異常終了、不足画面、出力超過、timeout は失敗として扱う。生成の前後で入力源を照合し、処理中に変化した場合は生成物を採用しない。

記録対象の子プロセスには PATH、固定した端末・locale 設定、一時 HOME などだけを渡す。Bun の `.env` 読み込みと依存の自動取得は無効にする。同じ OS 権限で動くため、未信頼コードを隔離する sandbox としては使わない。実際の秘密情報を録画しない。

開発性能は[プレビューの性能評価](research/preview-performance.md)に示す。通常の検査や hooks ではベンチマークを実行しない。

根拠: [Bun PTY](https://bun.com/docs/runtime/child-process#terminal-pty-support)、[asciicast v2](https://docs.asciinema.org/manual/asciicast/v2/)、[agg の描画と frame 選択](https://docs.asciinema.org/manual/agg/usage/)。

## 参照資料

- 設定: [flake.nix](../flake.nix)、[package.json](../package.json)、[tsconfig.json](../tsconfig.json)、[biome.json](../biome.json)。
- 一次情報: [Biome](https://biomejs.dev/guides/getting-started/)、[Prettier CLI](https://prettier.io/docs/cli)、[Husky](https://typicode.github.io/husky/)、[lint-staged](https://github.com/lint-staged/lint-staged)、[Bun install](https://bun.com/docs/pm/cli/install)、[Git hooks](https://git-scm.com/docs/githooks)。
