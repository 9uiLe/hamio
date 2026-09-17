# hamio

hamio は、開発用スクリプトの質問、進捗、表、結果を統一するターミナル UI ツールです。Shell、Python、Go、TypeScript などからコマンドラインと JSON で呼び出します。

利用側は業務処理の順序、並列数、権限、再試行を管理し、hamio は質問の表示、回答の検証、状態と結果の表示を担当します。本体・製品依存・Bun を含む単一実行ファイルで動作するため、UI の利用に Bun・Node.js・Nix の導入は不要です。業務処理のランタイムと依存は利用側で用意します。

## 導入

配布対象は macOS arm64 と Linux x64 / arm64（glibc）です。macOS 15、Ubuntu 24.04 の各 CPU に対応した環境で配布物を検証します。

[導入・更新手順](docs/distribution.md)に従い、採用する公開版を `.hamio-version` に完全な `vX.Y.Z` で固定してください。GitHub CLI でインストーラーと資産の証明を検証し、プロジェクト内の `.tools/bin/hamio` へ配置します。更新とロールバックも同じ検証経路を使います。通常の起動で通信や更新確認は行いません。

公開版 [v0.1.0](https://github.com/9uiLe/hamio/releases/tag/v0.1.0) は、3環境で配布候補の再現性・動作・証明と、公開後のインストーラー・GitHub Action・独立プロジェクトからの実行を確認しています。製品と検証用 workflow の識別情報、工程別結果、実測値、未検証範囲は[リリース評価](docs/release-readiness.md)を参照してください。

## スクリプトから使う

| コマンド       | 用途                                               |
| -------------- | -------------------------------------------------- |
| `form`         | 文字入力、確認、単一選択、複数選択、秘密入力を取得 |
| `render`       | メッセージ、値の一覧、表、進捗、結果、エラーを表示 |
| `stream`       | 改行区切りの JSON で受け取った業務の状態を表示     |
| `capabilities` | 契約版、製品版、対応機能、資源上限を照会           |

人向け UI は stderr、回答と機械向けの結果は stdout に出力します。対話フォームの回答も JSON なので、スクリプトが捕捉して業務処理に使えます。業務の成否と UI 操作の終了コードは別に判断します。

AI エージェントと CI は `form --interactive never` または `render / stream --format json` を指定します。対話待ちと装飾を使わず、stream は既定で最終応答一つを返します。全 event の応答が必要な場合は `--events` を指定します。

データ形式と終了コードは [API 契約](docs/api.md)、呼び出し方は [Shell](examples/form.sh)・[Python](examples/form.py)、CI への導入は [GitHub Actions の手順](docs/distribution.md#github-actions-で使う)を参照してください。

## 開発する

`nix-command` と `flakes` が有効な Nix を用意し、hamio のリポジトリ直下で実行します。

```sh
./scripts/dev.sh bun run setup
./scripts/dev.sh bun run build
./dist/hamio capabilities
sh examples/form.sh
```

setup は固定依存の取得と、この clone の Git hooks 導入を行います。build はホスト向けの `dist/hamio` を生成します。同じ OS・CPU の別リポジトリへ配置する場合は[ローカルビルドの手順](docs/distribution.md#手元でビルドした実行ファイル)に従います。

日常作業は `nix develop` 内で行い、shell 外では `./scripts/dev.sh` から固定環境を呼び出します。

```sh
./scripts/dev.sh bun run format
./scripts/dev.sh bun run check
```

型診断、Git hooks、PR の Quality workflow で変更を検査します。UI を変更したら `./scripts/preview.sh` の PNG と `./scripts/preview.sh --recording` の操作過程を開いて確認します。手順は[開発手順](docs/development.md)、画像は[製品プレビュー](docs/previews/README.md)にあります。

## 配布を保守する

配布候補は `./scripts/dev.sh bun run release:verify` で独立した二回の生成と展開後の動作を検証します。GitHub の Release workflow は所有者が目的を指定して実行します。

| モード           | 用途                                                              |
| ---------------- | ----------------------------------------------------------------- |
| `verify`         | 3環境の候補生成、実際の証明発行と検証                             |
| `publish`        | 版タグの候補を検証し、所有者の Environment 承認後に公開、導入試験 |
| `verify-install` | 指定した公開版のインストーラーと利用側 Action を3環境で試験       |

公開は immutable release とし、タグと資産を差し替えません。権限、承認条件、更新・障害対応は[配布手順](docs/distribution.md#保守者のリリース工程)に定めます。

## 文書案内

| 文書                                      | 読む目的                                                         |
| ----------------------------------------- | ---------------------------------------------------------------- |
| [基本設計](docs/design.md)                | 目的、責務、構成、性能・安全性、配布と保守の方針を理解する       |
| [API 契約](docs/api.md)                   | コマンド、JSON、状態、終了コード、上限に合わせて利用側を実装する |
| [実装設計](docs/implementation.md)        | 依存方向、処理の流れ、副作用と資源の所有者を理解する             |
| [開発手順](docs/development.md)           | Nix、検査、hooks、CI、プレビュー、性能測定を実行する             |
| [配布手順](docs/distribution.md)          | 導入、更新、候補検証、公開、公開物の導入試験を行う               |
| [リリース評価](docs/release-readiness.md) | 公開製品の検証結果、実測値、未検証範囲を確認する                 |
| [セキュリティ方針](SECURITY.md)           | 脆弱性の非公開報告、サポート、修正版の提供方針を確認する         |
| [AGENTS.md](AGENTS.md)                    | AI エージェントの作業規則と領域別スキルを確認する                |

設計目標と実測結果は分けて扱います。一次情報と測定資料は基本設計の[根拠資料](docs/design.md#根拠資料)から参照できます。

## ライセンス

hamio 本体は [MIT License](LICENSE)、著作権表記は `Copyright (c) 2026 9uiLe` です。第三者のコードには各部品のライセンスが適用されます。

配布物には許諾情報と同梱部品の在庫である SBOM を含めます。Bun 内部の native 部品は一つのランタイムとして記録し、個別部品を網羅した在庫とは区別します。[在庫と許諾の範囲](docs/distribution.md#配布物と在庫情報)
