# 開発環境と検査

hamio の開発は、Nix で固定したツールと Bun の lockfile に基づく依存を使う。編集、UI の目視確認、commit、push、PR の各工程で変更を検証し、CI を待つ前にローカルで問題を検出する。

本書は環境構築、コマンド、検査範囲、プレビューの生成と共有を定める。製品の責務と公開契約は[基本設計](design.md)、実装済みの範囲は [README](../README.md) を参照する。

## 1. 対応環境とツール

開発用 Nix shell の対応環境は次のとおりとする。

| OS    | CPU           | Nix system       |
| ----- | ------------- | ---------------- |
| macOS | Apple Silicon | `aarch64-darwin` |
| Linux | ARM64         | `aarch64-linux`  |
| Linux | x86_64        | `x86_64-linux`   |

Intel Mac 用 shell は提供しない。固定した Nixpkgs の[プラットフォーム方針](https://nixos.org/manual/nixpkgs/unstable/release-notes#x86_64-darwin-26.11)に従う。製品の配布対象は実行ファイルの実機検証で定め、この表とは分けて管理する。

| ツール                                                  | 用途                                    | 固定するファイル            |
| ------------------------------------------------------- | --------------------------------------- | --------------------------- |
| Bun                                                     | TypeScript スクリプト、依存管理、テスト | `flake.nix` / `flake.lock`  |
| Node.js                                                 | 開発用 JavaScript ツールの実行          | `flake.nix` / `flake.lock`  |
| Git、nixfmt、ShellCheck、shfmt、actionlint              | Git 操作、Nix・Shell・workflow の検査   | `flake.nix` / `flake.lock`  |
| TypeScript、Biome、Prettier、Husky、lint-staged、型定義 | 型検査、Lint、format、Git hooks         | `package.json` / `bun.lock` |
| agg、Python / Pillow、JetBrains Mono、Noto Sans CJK     | 端末出力の画像化                        | `flake.nix` / `flake.lock`  |

既定の `devShells.default` は日常の開発と検査に使用する。`devShells.preview` は既定のツールに画像生成ツールとフォントを加え、プレビュー生成時だけ使用する。Bun・Node.js をホストへ個別に導入する必要はない。開発用の依存は製品の配布物に含めない。

## 2. 初回セットアップ

Nix の `nix-command` と `flakes` を有効にする。基準版は Determinate Nix 3.15.1 とし、CI もこの版を使用する。[公式の導入手順](https://docs.determinate.systems/getting-started/)に従って環境を用意する。他の Nix 環境を使用する場合は、本書のコマンドで互換性を確認する。

リポジトリ直下で次を実行する。

```sh
./scripts/dev.sh bun run setup
./scripts/dev.sh bun run check
```

`setup` は `bun install --frozen-lockfile --ignore-scripts` で依存を取得し、この clone の Git hooks を導入する。依存宣言と lockfile が一致しなければ失敗し、パッケージの lifecycle scripts は実行しない。`core.hooksPath` が `.husky/_` 以外を指す場合は上書きせず、開発者が hooks を統合する。

`nix develop` は shell を開く操作であり、JS 依存の取得や Git 設定の変更は行わない。hooks は clone ごとの設定なので、clone ごとにセットアップする。

Nix store に不足するツールの取得にはネットワークとディスク容量を必要とする。binary cache の基準は Nix 公式の `cache.nixos.org` とし、リポジトリから別の cache や署名鍵を登録しない。署名検証を有効に保ち、ローカル固有の設定は開発者が管理する。

## 3. 日常の開発と検査

日常の作業は既定の Nix shell で行う。

```sh
nix develop
bun run format
bun run check
```

UI またはプレビューの生成元を変更した場合は、format の後に `bun run preview` を実行する。生成した画像を開き、ソースと生成物を一緒に確認してから全体検査を行う。詳しい確認範囲は[第8節](#8-ターミナル-ui-のプレビュー)に定める。

| コマンド                  | 用途                                                             |
| ------------------------- | ---------------------------------------------------------------- |
| `bun run lint`            | Biome、ShellCheck、actionlint による検査                         |
| `bun run lint:fix`        | Biome が安全と分類する Lint 修正の適用                           |
| `bun run format`          | format の自動修正                                                |
| `bun run format:check`    | format の読み取り専用検査                                        |
| `bun run typecheck`       | strict TypeScript 検査                                           |
| `bun run typecheck:watch` | 型検査の変更監視                                                 |
| `bun run test`            | テストの実行                                                     |
| `bun run test:watch`      | テストの変更監視                                                 |
| `bun run check:staged`    | ステージ済みの対象ファイルの検査                                 |
| `bun run preview`         | 専用 Nix shell で端末プレビューを生成                            |
| `bun run preview:check`   | 生成元と PNG の hash の照合                                      |
| `bun run check`           | Lint、format、型検査、テスト、プレビューの更新漏れ検査を順に実行 |

shell の外からは `./scripts/dev.sh bun run check` のように実行する。引数なしの `./scripts/dev.sh` も全体検査を実行する。Git hooks はこの入口を使い、GUI の PATH に Bun・Node.js がなくても Nix 環境を利用する。Nix が見つからなければ検査を省略せず失敗する。

全体検査は最初の失敗で停止し、ソースを自動修正しない。診断に応じて編集または修正用コマンドを実行し、差分を確認して再検査する。検査を通すためにルール、型検査、hooks を無効化しない。

### 編集時の支援

VS Code の推奨拡張と設定は `.vscode/` に置く。Biome が TS・JS・JSON、Prettier が Markdown・YAML の保存時 format を担当する。[TypeScript 7 拡張](https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.native-preview)は `node_modules/typescript` を参照し、CLI と同じ版を使用する。

拡張は開発者が導入する。他のエディタでもローカルに固定したツールを使い、`bun run check` で共通の規則を確認する。

### ファイル別の検査

| 対象           | 検査                                        | format                    |
| -------------- | ------------------------------------------- | ------------------------- |
| TS・JS         | Biome。TS は宣言ファイルを含めて型検査する  | Biome                     |
| JSON・JSONC    | Biome                                       | Biome                     |
| Markdown       | 内容、参照先、format                        | Prettier                  |
| YAML・workflow | format。workflow は actionlint でも検査する | Prettier                  |
| Nix            | 定義評価                                    | nixfmt                    |
| Shell・hooks   | ShellCheck                                  | shfmt                     |
| プレビュー     | 生成元・画像の hash、目視確認               | manifest の JSON は Biome |

検査範囲は [package.json](../package.json) と[ステージ済みファイルの規則](../.lintstagedrc.json)に定義する。Nix 定義を変更した場合は、全体検査に加えて次を実行する。

```sh
nix flake check --all-systems --no-build --no-write-lock-file
```

このコマンドは全 system の定義を評価する。各 OS 上での実行試験ではなく、`bun run check` にも含まれない。

## 4. Git hooks

Husky が hooks の実行を管理する。`pre-commit` と `pre-push` は検査範囲を分担する。

| hook       | 検査対象                   | 動作                                                                                |
| ---------- | -------------------------- | ----------------------------------------------------------------------------------- |
| pre-commit | ステージ済みの対象ファイル | lint-staged で検査する。同時タスクは2。部分ステージの未ステージ部分を退避・復元する |
| pre-push   | 作業ツリー全体             | `bun run check` で型、テスト、プレビューを含めて検査する                            |

hooks はソースを自動修正しない。失敗した場合は修正、差分確認、再ステージを行う。pre-push の対象には未コミットの内容も含まれるため、送信する commit と検査済みの作業ツリーは一致しない場合がある。PR の CI でマージ候補を検証する。

hooks はローカルで回避できる。GitHub 上の強制的なマージ条件には branch ruleset を使用する。

hooks のテストは一時 Git リポジトリ内で実行する。不正な commit・push の拒否、部分ステージの復元、正常系、他の hooks 設定の保護を確認する。

## 5. GitHub Actions

[Quality workflow](../.github/workflows/quality.yml)は `master` 向け PR と手動実行を対象とする。実行者をリポジトリ所有者に限定し、PR は同一リポジトリを送信元とするものだけを検査する。

| 起動方法 | 対象                                      | runner                           |
| -------- | ----------------------------------------- | -------------------------------- |
| 自動     | PR の `opened`、`synchronize`、`reopened` | `ubuntu-24.04`                   |
| 手動     | 選択したブランチ                          | `ubuntu-24.04` または `macos-15` |

push と PR close はトリガーに含めない。マージ時の push でも自動実行せず、変更は PR で検証する。直接 push した commit には自動検査が付かない。

### ジョブの内容

品質検査は1ジョブで次の順序で実行する。

1. 対象コードを checkout し、固定した Nix を導入する。
2. `nix flake check --all-systems --no-build --no-write-lock-file` で Nix 定義を評価する。
3. Nix shell 内で `bun install --frozen-lockfile --ignore-scripts` を実行する。
4. 同じ shell 内で `bun run check` を実行する。依存取得に失敗した場合は検査へ進まない。
5. `git diff --exit-code` で追跡対象ファイルに変更がないことを確認する。

画像生成は実行せず、commit された PNG と生成元の一致を検査する。文書だけの PR も format の対象とする。ジョブの構成と準備時間の評価は[CI の構成と測定](research/ci.md)を参照する。

Actions は完全な commit SHA、Nix インストーラーは版を固定する。`pull_request_target` は使わず、トークンは読み取り権限に限定する。checkout 後に認証情報を保持しない。CI では hooks を導入せず、検査コマンドを直接実行する。

同じ event・ref・runner の古い実行はキャンセルする。PR と手動実行、異なる OS の手動実行は互いをキャンセルしない。ジョブの上限は20分とする。検査成功をマージ条件にする場合は、branch ruleset で `quality` を必須チェックとして設定する。

### macOS の確認

Bun・Nix・hooks・OS に関わる依存を変更する場合は、マージ前に macOS でも検査する。Actions の `Run workflow` でブランチと `runner: macos-15` を選択するか、次を実行する。

```sh
gh workflow run quality.yml --ref YOUR_BRANCH -f runner=macos-15
```

`YOUR_BRANCH` は確認するブランチ名に置き換える。手動実行が検証するのは選択ブランチの commit であり、PR のマージ候補とは異なる場合がある。変更を重ねた場合は必要な OS の検査を再実行する。Linux の再現確認には `runner=ubuntu-24.04` を指定する。

通常の PR の成功は macOS 固有の動作を保証しない。製品の端末 I/O、プロセス管理、配布物を実装する際は、両 OS の実行テストを自動化する範囲を定める。

## 6. 開発用スキル

開発を支援するエージェントの判断基準は `.agents/skills` に置き、[AGENTS.md](../AGENTS.md)を入口とする。必要な領域だけを読み、機械的な検査で判断できない設計、契約、測定条件を確認する。

| スキル                                                                    | 使用する場面                      | 判断する内容                                           |
| ------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------ |
| [hamio-software-design](../.agents/skills/hamio-software-design/SKILL.md) | 入出力、状態遷移、モジュール境界  | 業務と UI の責務、公開契約、失敗状態、依存方向         |
| [hamio-typescript](../.agents/skills/hamio-typescript/SKILL.md)           | TypeScript の実装・変更・レビュー | 境界検証、状態の型表現、strict 設定、Promise と副作用  |
| [hamio-performance](../.agents/skills/hamio-performance/SKILL.md)         | 起動、CPU、メモリ、通知量、並列性 | 比較条件、計測指標、保持量、描画頻度、並列処理のコスト |

スキルは作業範囲や公開権限を広げるものではない。製品の性能予算は配布物の測定で判定し、通常の検査成功とは区別する。

## 7. 依存とツールの更新

`flake.lock` と `bun.lock` は明示的な更新作業で変更する。取得元、版、差分、lifecycle scripts を確認し、通常の実行では lockfile を暗黙に更新しない。`bunx` などの自動取得を日常の実行経路へ持ち込まない。

Bun を更新する場合は Nix 定義、`packageManager`、`engines`、型定義を整合させる。Node.js は開発ツールの要件に合わせる。更新後は固定環境で依存を取得し、定義評価、プレビュー再生成、全体検査を行う。

```sh
bun install --frozen-lockfile --ignore-scripts
nix flake check --all-systems --no-build --no-write-lock-file
bun run format
bun run preview
bun run check
```

`@types/node` は Bun の型定義が参照する依存として `overrides` で固定する。Bun 1.4.2 の宣言に必要な型を含む26.6.1を使用し、宣言ファイルも検査する。この型定義は開発用 Node.js 24 の実行時 API を保証するものではない。リポジトリの TypeScript スクリプトは Bun で実行する。

`bun audit` は既知の脆弱性を調べる補助検査とする。依存の取得元、コード、配布工程も確認する。製品に同梱するランタイムの更新と配布検証は[基本設計](design.md)に従う。

## 8. ターミナル UI のプレビュー

プレビューは、疑似端末で実行した出力を PNG と GIF に変換し、PR とチャットで見た目を確認するための開発機能である。[プレビュー一覧](previews/README.md)に代表画像を置く。

`fixture` は日本語、色、入力、カーソル更新を扱う録画基盤の検証用プログラムである。製品の UI や公開 API は実装していない。製品の表示を確認するシナリオは、製品の入口を直接呼び出す。

### 生成と目視確認

リポジトリ直下で実行する。Nix shell の外からも使える。

```sh
./scripts/preview.sh
# 操作途中の録画も生成する場合
./scripts/preview.sh --recording
```

既定の開発 shell 内では `bun run preview` でもよい。画像生成用 shell に必要なツールとフォントが Nix store になければ取得する。

| 出力                          | 内容                              | Git 管理                     |
| ----------------------------- | --------------------------------- | ---------------------------- |
| `docs/previews/*.png`         | 代表状態の静止画。1枚512 KiB以下  | ソースと同じ commit に含める |
| `docs/previews/manifest.json` | 生成元と PNG の SHA-256、生成環境 | PNG と同じ commit に含める   |
| `dist/preview/*.cast`         | 端末出力と時間の記録              | 対象外                       |
| `dist/preview/*.gif`          | `--recording` 指定時の操作録画    | 対象外                       |

PNG を画像として開き、日本語、余白、折り返し、色、カーソル更新の残骸を確認する。入力や状態遷移を変更した場合は GIF の操作途中も確認する。固定した端末エミュレーターによる再描画なので、各 OS の実際の端末、アクセシビリティ、性能予算は別に検証する。

### 更新漏れの検出

`bun run preview:check` は次の生成元と PNG の hash を照合する。

- `scripts/preview/**/*.ts` と `scripts/preview.sh`
- `src/**/*`
- `flake.nix`、`flake.lock`、`package.json`、`bun.lock`

ファイルの追加・削除も対象とする。format を含め、生成後に対象を変更すると検査は失敗する。再生成し、画像を確認してからステージする。開発用の依存設定だけを変更した場合も再生成する。

この検査は pre-push と PR の全体検査に含む。画像を描画しないため通常の検査に描画ツールを必要としない。hash の照合は目視確認や端末の動作試験を代替しない。

### PR とチャットへの掲載

[PR テンプレート](../.github/pull_request_template.md)の UI プレビュー欄に画像を埋め込む。PNG と manifest を commit・push した後、`git rev-parse HEAD` で得た SHA を `COMMIT_SHA` に指定する。

```md
![入力画面](https://raw.githubusercontent.com/9uiLe/hamio/COMMIT_SHA/docs/previews/fixture-input.png)
![結果画面](https://raw.githubusercontent.com/9uiLe/hamio/COMMIT_SHA/docs/previews/fixture-result.png)
```

画像リンクは対象 commit に固定し、PR を更新した場合はリンクも更新する。シナリオ、確認した状態、未確認の OS・端末を添える。読者は追加ツールや artifact のダウンロードなしに静止画を確認できる。

チャットには同じ PNG をローカルの絶対パスでインライン表示する。AI エージェントは `.cast` 全文を転記せず、画像と確認内容を使う。GIF を PR に添付する場合は内容を確認して手動でアップロードする。外部録画サービスへ自動送信しない。

### シナリオと記録処理

[scripts/preview/scenarios.ts](../scripts/preview/scenarios.ts)に実行コマンド、端末サイズ、待つ出力、送るキー、撮影する状態を定義する。基準のサイズは80列・20行とする。期待する出力を待って入力することで、起動速度による撮影位置のずれを抑える。

製品のシナリオには最小のダミーデータを用い、通常、エラー、キャンセルなど変更対象の状態を再現する。fixture が別ファイルからデータを読む場合は、その入力も `sourceHashes` の照合対象に含める。

Bun の PTY で stdout・stderr を含む出力を記録し、agg が ANSI とカーソル操作を解釈する。Pillow は選択した静止フレームを PNG に変換する。別の画面実装で表示を模倣しない。

キャプチャは1シナリオずつ実行する。既定の上限は15秒、出力1 MiB、10,000 eventとし、異常終了、不足画面、出力超過、timeout を失敗として扱う。描画も順次実行し、コマンドごとに60秒の上限を設ける。agg の Rayon スレッドプールは2、GIF は10 fpsに設定する。これはプロセス全体のスレッド数の上限ではなく、製品の性能予算とも別の設定である。

記録対象の子プロセスには PATH、固定した端末・locale設定、一時 HOME などだけを渡す。Bun の `.env` 自動読込と依存の自動取得は無効にする。同じ OS 権限のコードを実行する仕組みなので、未信頼のコードを隔離する sandbox ではない。ダミーデータだけを使用し、実際の秘密情報を録画しない。画像と録画は公開資料として内容を確認する。

根拠: [Bun PTY](https://bun.com/docs/runtime/child-process#terminal-pty-support)、[asciicast v2](https://docs.asciinema.org/manual/asciicast/v2/)、[agg の描画と frame 選択](https://docs.asciinema.org/manual/agg/usage/)。画像生成にブラウザーや外部サーバーは使用しない。

## 参照資料

- 設定: [flake.nix](../flake.nix)、[package.json](../package.json)、[tsconfig.json](../tsconfig.json)、[biome.json](../biome.json)。
- 一次情報: [Biome](https://biomejs.dev/guides/getting-started/)、[Prettier CLI](https://prettier.io/docs/cli)、[Husky](https://typicode.github.io/husky/how-to.html)、[lint-staged](https://github.com/lint-staged/lint-staged)、[Bun install](https://bun.com/docs/pm/cli/install)、[Git hooks](https://git-scm.com/docs/githooks)。
