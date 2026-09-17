# hamio

hamio は、開発用スクリプトの質問、進捗、表、結果を統一するターミナル UI ツールです。Shell、Python、Go、TypeScript などからコマンドラインと JSON で呼び出します。

利用側が業務処理の順序、並列数、権限、再試行を管理し、hamio が質問の表示、回答の検証、状態と結果の表示を担当します。本体・製品依存・Bun を含む単一実行ファイルを使うため、UI の利用に Bun・Node.js・Nix の導入は不要です。業務処理に必要な言語ランタイムは利用側で用意します。

## スクリプトとの接続

| コマンド       | 用途                                               |
| -------------- | -------------------------------------------------- |
| `form`         | 文字入力、確認、単一選択、複数選択、秘密入力を取得 |
| `render`       | メッセージ、値の一覧、表、進捗、結果、エラーを表示 |
| `stream`       | 改行区切りの JSON で受け取った業務の状態を表示     |
| `capabilities` | 契約版、製品版、対応機能、資源上限を照会           |

人向け UI は stderr、回答と機械向けの結果は stdout へ出します。対話フォームの回答も JSON なので、スクリプトが捕捉して業務処理に使えます。

AI エージェントと CI は `form --interactive never` または `render / stream --format json` を指定します。対話待ちと装飾を使わず、連続表示は既定で最終結果だけを返します。形式と終了コードは [API 契約](docs/api.md)、接続例は [examples/](examples/)を参照してください。

## 導入と対応環境

配布対象は macOS arm64 と Linux x64/arm64（glibc）です。配布物は macOS 15、Ubuntu 24.04 の各 CPU に対応した環境で検証します。

[公開リリース](https://github.com/9uiLe/hamio/releases)から採用する版を選び、`.hamio-version` に完全な `vX.Y.Z` を記録します。GitHub CLI でインストーラーと資産の証明を検証し、プロジェクト内の `.tools/bin/hamio` から実行します。更新とロールバックも同じ検証経路を使います。[導入・更新手順](docs/distribution.md)

2026-09-17の[リリース評価](docs/release-readiness.md)では、3環境で配布候補の再現性、API・端末試験、実際の由来の証明、独立プロジェクトからの実行を確認しています。この評価時点で正式リリースは未公開です。候補検証と、公開後の資産取得・導入の確認を区別して記録しています。

## ソースからビルドする

開発・ビルドには `nix-command` と `flakes` が有効な Nix を使います。hamio のリポジトリ直下で実行してください。

```sh
./scripts/dev.sh bun run setup
./scripts/dev.sh bun run build
./dist/hamio capabilities
sh examples/form.sh
```

setup は固定依存の取得と、この clone の Git hooks 導入を行います。build はホスト向けの `dist/hamio` を生成します。同じ OS・CPU の別リポジトリでも[ローカルビルドの手順](docs/distribution.md#手元でビルドした実行ファイル)で利用できます。

## 開発と品質確認

日常作業は `nix develop` で行い、shell 外では `./scripts/dev.sh` から固定環境を呼び出します。

```sh
./scripts/dev.sh bun run format
./scripts/dev.sh bun run check
```

型診断、Git hooks、PR の CI で Lint、format、型、テスト、プレビュー照合を実行します。UI を変更した場合は `./scripts/preview.sh` の PNG と、`./scripts/preview.sh --recording` の操作過程を確認します。[製品プレビュー](docs/previews/README.md)

配布候補は `./scripts/dev.sh bun run release:verify` で独立した二回の生成と展開後の動作を検証します。GitHub の Release workflow は3環境で候補と証明を検証し、正式公開には版タグの指定と所有者の承認を必要とします。

## 文書案内

| 文書                                      | 読む目的                                                         |
| ----------------------------------------- | ---------------------------------------------------------------- |
| [基本設計](docs/design.md)                | 目的、責務、構成、性能・安全性、リリースの判断基準を理解する     |
| [API 契約](docs/api.md)                   | コマンド、JSON、状態、終了コード、上限に合わせて利用側を実装する |
| [実装設計](docs/implementation.md)        | モジュール、依存方向、処理の流れ、副作用と資源の所有者を理解する |
| [開発手順](docs/development.md)           | Nix、検査、hooks、CI、プレビュー、性能測定を実行する             |
| [配布手順](docs/distribution.md)          | 導入、更新、ロールバック、候補検証、公開、障害対応を行う         |
| [リリース評価](docs/release-readiness.md) | 対象 commit の検証結果、実測値、未検証範囲を確認する             |
| [セキュリティ方針](SECURITY.md)           | 脆弱性を非公開で報告し、サポートと修正版の提供方針を確認する     |
| [AGENTS.md](AGENTS.md)                    | AI エージェントの作業規則と領域別スキルを確認する                |

性能値は対象ソースと測定条件に結び付けて扱います。設計上の目標と、配布版で保証する範囲は[リリース評価](docs/release-readiness.md)で確認してください。一次情報と測定資料は基本設計の[根拠資料](docs/design.md#根拠資料)から参照できます。

## ライセンス

hamio 本体は [MIT License](LICENSE)、著作権表記は `Copyright (c) 2026 9uiLe` です。第三者のコードには各部品のライセンスが適用されます。

配布物には許諾情報と同梱部品の在庫である SBOM を含めます。Bun 内部の native 部品は一つのランタイムとして記録し、個別部品を網羅した SBOM とは区別します。[在庫と許諾の範囲](docs/distribution.md#配布物と在庫情報)
