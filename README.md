# hamio

hamio は、開発用スクリプトの質問、進捗、表、結果を統一するターミナル UI ツールです。Shell、Python、Go、TypeScript などから CLI と JSON で呼び出します。

利用側が業務の順序、並列数、権限、再試行を管理し、hamio が質問の表示、回答の検証、状態と結果の表示を担当します。本体・製品依存・Bun を含む実行ファイルを提供するため、UI の利用に Bun・Node.js・Nix の導入は不要です。

## 提供状況

公開リリースはありません。試す場合は[ソースからビルド](#ソースからビルドする)し、同じ OS・CPU の別リポジトリへ実行ファイルを配置できます。

| 対象       | 実装と検証の範囲                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| API v1     | フォーム、単発表示、連続表示、機能照会を実装                                                                  |
| 実行       | macOS 15 arm64、Ubuntu 24.04 x64/arm64 で契約、PTY、同梱実行ファイル、Bun のない PATH での動作を確認          |
| 配布候補   | 3対象で独立した二回の全資産の一致、展開後の API・端末試験、実際の provenance 検証を確認                       |
| 導入・更新 | インストーラーと利用側の GitHub Action を実装。失敗処理は GitHub CLI の代替実装で試験                         |
| 公開       | Release workflow を実装。候補検証と所有者承認を経て公開。実行結果と未検証範囲はリリース評価に記録             |
| 品質       | 性能は対象ソース・環境を特定して測定。最低 OS、実端末、アクセシビリティ、全性能予算は配布対象ごとに評価が必要 |

[リリース評価](docs/release-readiness.md)、[セキュリティ方針](SECURITY.md)、[受け入れ条件](docs/design.md#12-リリースの受け入れ条件)、[検査の構成](docs/implementation.md#10-検証の構成)、[測定記録](docs/research/reproducibility-performance.md)に評価の範囲を示しています。

## スクリプトとの接続

| コマンド       | 用途                                               |
| -------------- | -------------------------------------------------- |
| `form`         | 文字入力、確認、単一選択、複数選択、秘密入力を取得 |
| `render`       | メッセージ、値の一覧、表、進捗、結果、エラーを表示 |
| `stream`       | 改行区切りの JSON で受け取った業務の状態を表示     |
| `capabilities` | 契約版、製品版、対応機能、資源上限を照会           |

人向け UI は stderr、回答と機械向けの結果は stdout へ出します。対話フォームの回答も JSON なので、スクリプトが捕捉して業務処理へ渡せます。業務処理の言語ランタイムは利用側で用意します。

AI エージェントと CI は `form --interactive never`、`render / stream --format json` を指定します。対話待ちと装飾を使わず、連続表示は既定で最終結果だけを返します。形式と終了コードは [API 契約](docs/api.md)、接続例は [examples/](examples/)を参照してください。

## ソースからビルドする

開発・ビルドには、`nix-command` と `flakes` が有効な Nix を使います。hamio のリポジトリ直下で実行してください。

```sh
./scripts/dev.sh bun run setup
./scripts/dev.sh bun run build
./dist/hamio capabilities
sh examples/form.sh
```

setup は固定依存の取得と、この clone の Git hooks 導入を行います。build はホスト向けの `dist/hamio` を生成します。別リポジトリへのコピーは[ローカルビルドの利用手順](docs/distribution.md#手元でビルドした実行ファイル)に従ってください。

## 公開版の導入と更新

配布対象は macOS arm64 と Linux x64/arm64 の glibc 環境です。Release workflow は macOS 15 と Ubuntu 24.04 で配布候補を生成し、全資産の再現性と展開後の動作を検証します。

利用側は `.hamio-version` に完全な版を記録します。検証済みインストーラーが公開資産の由来、hash、製品版を照合して配置し、成功後に `.tools/bin/hamio` を切り替えます。更新とロールバックも同じ検証経路を使います。

導入・更新には GitHub CLI と通信を使います。通常実行は配置した実行ファイルを直接起動します。[配布手順](docs/distribution.md)にインストーラーの取得、GitHub Actions、更新、削除、保守者の公開工程をまとめています。

## 開発とレビュー

日常作業は `nix develop` で行います。shell 外では `./scripts/dev.sh` から固定環境を呼び出せます。

```sh
./scripts/dev.sh bun run format
./scripts/dev.sh bun run check
```

編集時の診断、Git hooks、PR の CI で Lint、format、型、テスト、プレビュー照合を実行します。UI を変更したら `./scripts/preview.sh` の PNG を開き、操作途中は `./scripts/preview.sh --recording` の GIF を確認します。[プレビュー一覧](docs/previews/README.md)では製品の `product` と録画基盤用の `fixture` を区別しています。

配布候補を確認する場合は `./scripts/dev.sh bun run release:verify` を実行します。二回の独立生成を比較し、gzip から展開した実行ファイルを API・端末試験へ渡します。操作と検査範囲の正本は[開発手順](docs/development.md)です。

## 設計文書

| 文書                               | 読む目的                                             |
| ---------------------------------- | ---------------------------------------------------- |
| [基本設計](docs/design.md)         | 目的、責務、接続、性能、安全性、配布方針を理解する   |
| [API 契約](docs/api.md)            | コマンド、JSON、状態、終了コード、上限を確認する     |
| [実装設計](docs/implementation.md) | 依存方向、処理手順、副作用と資源の所有者を理解する   |
| [開発手順](docs/development.md)    | Nix、検査、hooks、CI、プレビュー、性能測定を実行する |
| [配布手順](docs/distribution.md)   | 導入、更新、ロールバック、梱包、公開を行う           |
| [AGENTS.md](AGENTS.md)             | AI エージェントの作業規則と領域別スキルを確認する    |

一次情報と測定資料は基本設計の[根拠資料](docs/design.md#根拠資料)から参照できます。測定資料には対象ソース、環境、入力、実測値、未確認範囲を記録しています。

## ライセンス

hamio 本体は [MIT License](LICENSE) です。著作権表記は `Copyright (c) 2026 9uiLe`、第三者のコードには各部品のライセンスが適用されます。

配布物には本体と依存の許諾情報、同梱部品の在庫である SBOM を含めます。Bun 内部の native 部品は個別の版を解決していません。在庫と許諾の範囲は[配布物と在庫情報](docs/distribution.md#配布物と在庫情報)に記載しています。
