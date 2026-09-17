# 開発環境と検査

hamio の開発は、Nix で固定したツールと Bun の lockfile に基づく依存を使う。編集時の診断、Git hooks、GitHub Actions で同じ規則を適用し、問題をローカルで検出してから PR で検証する。

本書は開発者と開発を支援する AI エージェントの作業手順を定める。製品の責務、入出力、性能予算、配布条件は[基本設計](design.md)を参照する。

## 1. 対応環境とツール

開発用の Nix shell は次の環境を対象とする。

| OS    | CPU           | Nix system       |
| ----- | ------------- | ---------------- |
| macOS | Apple Silicon | `aarch64-darwin` |
| Linux | ARM64         | `aarch64-linux`  |
| Linux | x86_64        | `x86_64-linux`   |

Intel Mac 用の shell は提供しない。固定した Nixpkgs の対応範囲は[プラットフォーム方針](https://nixos.org/manual/nixpkgs/unstable/release-notes#x86_64-darwin-26.11)に従う。製品の配布対象は配布物の実機検証によって定め、開発環境の対応表とは分けて管理する。

| ツール                                                  | 用途                                    | 管理するファイル            |
| ------------------------------------------------------- | --------------------------------------- | --------------------------- |
| Bun                                                     | TypeScript スクリプト、依存管理、テスト | `flake.nix` / `flake.lock`  |
| Node.js                                                 | 開発用の JavaScript ツールの実行        | `flake.nix` / `flake.lock`  |
| Git、nixfmt、ShellCheck、shfmt、actionlint              | Git 操作と Nix・Shell・workflow の検査  | `flake.nix` / `flake.lock`  |
| TypeScript、Biome、Prettier、Husky、lint-staged、型定義 | 型検査、Lint、format、Git hooks         | `package.json` / `bun.lock` |

Bun と Node.js をホストへ個別に導入する必要はない。Nix shell が提供する実行ファイルを使い、開発ツールの依存を製品の配布物へ持ち込まない。

## 2. 初回セットアップ

Nix の `nix-command` と `flakes` が有効な環境を用意する。Nix の基準版は Determinate Nix 3.15.1 とし、[公式の導入手順](https://docs.determinate.systems/getting-started/)を参照する。CI はこの版を使用する。既存の Nix を利用する場合は、本書の検査コマンドで互換性を確認する。

リポジトリは追加の binary cache や署名鍵を登録しない。取得先は Nix 公式の `cache.nixos.org` を基準とし、ローカルの追加設定は開発者が管理する。署名検証は有効に保つ。

リポジトリ直下で次を実行する。

```sh
./scripts/dev.sh bun run setup
./scripts/dev.sh bun run check
```

`setup` は固定した Nix 環境で `bun install --frozen-lockfile --ignore-scripts` を実行し、この clone の Git hooks を導入する。依存宣言と lockfile が一致しない場合は失敗し、パッケージの lifecycle scripts は実行しない。既存の `core.hooksPath` が `.husky/_` 以外を指す場合は上書きせず、手動統合を必要とする。

`nix develop` は開発 shell を開く入口であり、JS 依存のインストールや Git 設定の変更は行わない。Nix store に不足するツールの取得にはネットワークとディスク容量を必要とする。Git hooks は clone ごとの設定なので、各 clone でセットアップを実行する。

## 3. 編集とローカル検査

日常の作業は Nix shell 内で行う。

```sh
nix develop
bun run format
bun run check
```

`format` による変更は差分を確認する。編集を続けながら型エラーを検出する場合は、別ターミナルの Nix shell で `bun run typecheck:watch` を実行する。テストの変更監視には `bun run test:watch` を使う。

| コマンド               | 役割                                        |
| ---------------------- | ------------------------------------------- |
| `bun run lint`         | Biome、ShellCheck、actionlint による検査    |
| `bun run lint:fix`     | Biome が安全と分類する Lint 修正の適用      |
| `bun run format`       | format の修正                               |
| `bun run format:check` | format の読み取り専用検査                   |
| `bun run typecheck`    | strict TypeScript 検査                      |
| `bun run test`         | テストの実行                                |
| `bun run check:staged` | ステージ済みの対象ファイルの検査            |
| `bun run check`        | Lint、format 検査、型検査、テストを順に実行 |

Nix shell の外からは `./scripts/dev.sh bun run check` のように実行する。引数なしの `./scripts/dev.sh` も全体検査を実行する。Git hooks はこの入口を使うため、GUI の PATH に Bun・Node.js がなくても Nix 環境を利用できる。Nix が見つからない場合は検査を省略せず失敗する。

検査は最初の失敗で停止する。検査コマンドはソースを修正しないため、診断に応じて編集または修正用コマンドを実行し、差分を確認してから再検査する。検査を通す目的でルールや hooks を無効化しない。

Nix 定義を変更した場合は、全体検査に加えて次の評価を行う。これは対象 system の定義を評価するコマンドであり、全 OS 上での実行試験ではない。

```sh
nix flake check --all-systems --no-build --no-write-lock-file
```

### エディタ

VS Code の推奨拡張と設定は `.vscode/` に置く。Biome が TS・JS・JSON の、Prettier が Markdown・YAML の保存時 format を担当する。[TypeScript 7 拡張](https://marketplace.visualstudio.com/items?itemName=TypeScriptTeam.native-preview)は `node_modules/typescript` を参照し、CLI と同じ版で型を検査する。

拡張は開発者が導入する。他のエディタでもローカルに固定したツールを利用し、`bun run check` でリポジトリ共通の規則を確認する。

### ファイル別の検査

| 対象           | Lint / 検査                            | format   |
| -------------- | -------------------------------------- | -------- |
| TS・JS         | Biome。TS は TypeScript でも型検査する | Biome    |
| JSON・JSONC    | Biome                                  | Biome    |
| Markdown       | 内容とリンクを確認する                 | Prettier |
| YAML・workflow | workflow は actionlint                 | Prettier |
| Nix            | `nix flake check` による定義の評価     | nixfmt   |
| Shell・hooks   | ShellCheck                             | shfmt    |

検査範囲とコマンドは [package.json](../package.json)、[ステージ済みファイルの規則](../.lintstagedrc.json)に定義する。Nix 定義の評価は `bun run check` に含まれないため、上記のコマンドで別途実行する。

## 4. Git hooks

Husky が hooks の実行を管理し、`pre-commit` は lint-staged でステージ済みの対象ファイルを検査する。同時タスクは2に制限する。ファイルの一部だけをステージしている場合、未ステージの変更は lint-staged が退避・復元する。

`pre-push` は作業ツリー全体に `bun run check` を実行し、型やファイルをまたぐ問題を検出する。検査には未コミットの修正も含まれるため、検査対象と送信する commit の内容は一致するとは限らない。PR の CI は GitHub が checkout したマージ候補をクリーンな環境で検証する。

hooks はソースを自動修正しない。失敗した場合は修正、差分確認、再ステージを行う。変更ファイルだけを調べる `pre-commit` と、全体を調べる `pre-push` を組み合わせ、commit ごとの待ち時間と検査範囲を両立する。

hooks はローカルで回避できるため、強制的なマージ制限には使わない。hooks のテストは一時 Git リポジトリ内で行い、不正な commit・push の拒否、部分ステージの復元、正常系、既存 hooks 設定の保護を確認する。

## 5. GitHub Actions

[Quality workflow](../.github/workflows/quality.yml)は `master` 向け PR、`master` への push、手動実行を対象とする。実行者をリポジトリ所有者に限定し、PR は同一リポジトリを送信元とするものだけを検査する。

`ubuntu-24.04` と `macos-15` で、次の順序で実行する。

1. 固定した Actions と Nix を使い、対象コードを checkout する。
2. `nix flake check --all-systems --no-build --no-write-lock-file` で Nix 定義を評価する。
3. Nix 環境で `bun install --frozen-lockfile --ignore-scripts` を実行する。
4. 同じ環境で `bun run check` を実行する。
5. `git diff --exit-code` で追跡対象ファイルに変更が生じていないことを確認する。

Actions は完全な commit SHA、Nix インストーラーは版を固定する。`pull_request_target` は使わず、トークンは読み取り権限に限定し、checkout の認証情報を保持しない。CI では hooks をインストールせず、検査コマンドを直接実行する。

同じ workflow と ref の古い実行はキャンセルする。各 OS のジョブには20分の上限を設け、一方が失敗しても他方の結果を確認できるようにする。失敗した検査をマージ禁止の条件にする場合は、GitHub の branch ruleset で別途管理する。

## 6. 開発用スキル

開発を支援するエージェントの判断基準は `.agents/skills` に保存し、[AGENTS.md](../AGENTS.md)を入口とする。スキルはリポジトリとともに版管理し、作業に必要な領域だけ読む。

| スキル                                                                    | 使う場面                                      | 判断する内容                                             |
| ------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------- |
| [hamio-software-design](../.agents/skills/hamio-software-design/SKILL.md) | 入出力、状態、モジュール境界の設計            | 業務と UI の責務、公開契約、失敗状態、依存方向           |
| [hamio-typescript](../.agents/skills/hamio-typescript/SKILL.md)           | TS の実装・変更・レビュー                     | 未信頼入力の検証、union、strict 設定、Promise と副作用   |
| [hamio-performance](../.agents/skills/hamio-performance/SKILL.md)         | 起動、CPU、メモリ、通知量、並列性の調査・変更 | 比較条件、測定指標、保持量、進捗の集約、並列実行のコスト |

スキルは Lint・型検査・テストを補う設計基準である。製品の性能予算は配布物の測定で判定し、通常の検査の成功を性能達成の根拠にはしない。

## 7. 依存とツールの更新

`flake.lock` と `bun.lock` は明示的な更新作業で変更する。取得元、版、差分、必要な lifecycle scripts を確認し、通常の開発と CI では lockfile を暗黙に更新しない。`bunx` などによるツールの自動取得を日常の実行経路に持ち込まない。

Bun の更新では Nix 定義、`packageManager`、`engines`、Bun の型定義を整合させる。Node.js は開発ツールの必要条件を満たす版を使用する。更新後は固定した環境で依存を取得し、Nix 定義の評価と全体検査を実行する。

```sh
bun install --frozen-lockfile --ignore-scripts
nix flake check --all-systems --no-build --no-write-lock-file
bun run check
```

`@types/node` は Bun の型定義が参照する依存として `overrides` で固定する。Bun 1.4.2 の宣言に必要な型を含む 26.6.1 を使用し、宣言ファイルも検査する。この型定義の版は開発用 Node.js 24 の API 対応範囲を表さない。リポジトリの TypeScript スクリプトは Bun で実行する。

`bun audit` は既知の脆弱性を調べる補助検査として利用する。版固定と audit の結果に加え、依存コードと配布工程を確認する。製品に同梱するランタイムの更新と配布検証は[基本設計](design.md)に従う。

## 参照資料

- 設定: [flake.nix](../flake.nix)、[package.json](../package.json)、[tsconfig.json](../tsconfig.json)、[biome.json](../biome.json)。
- 一次情報: [Biome](https://biomejs.dev/guides/getting-started/)、[Prettier CLI](https://prettier.io/docs/cli)、[Husky](https://typicode.github.io/husky/how-to.html)、[lint-staged](https://github.com/lint-staged/lint-staged)、[Bun install](https://bun.com/docs/pm/cli/install)、[Git hooks](https://git-scm.com/docs/githooks)。
