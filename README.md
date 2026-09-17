# hamio

hamio は、開発用スクリプトの入力フォーム、進捗、表、結果を統一するターミナル UI ツールです。利用側は Shell、Python、Go、TypeScript などで業務処理を実装し、CLI と JSON を通じて入力と表示を hamio に委譲します。

人には端末上の操作画面を、AI エージェントと CI には非対話入力と構造化出力を提供します。業務の実行順序、並列数、権限、再試行は利用側が管理します。

## 提供する機能

| コマンド       | 用途                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------- |
| `form`         | 文字入力、確認、単一選択、複数選択、秘密入力。回答、不足、無効値、キャンセルを JSON で返します |
| `render`       | メッセージ、値の一覧、表、進捗、結果、エラーを表示します                                       |
| `stream`       | 改行区切りの JSON で処理状態を受け取り、進捗を集約します。機械出力の既定は最終結果のみです     |
| `capabilities` | 契約版、対応機能、資源上限を必要な範囲で照会します                                             |

端末 UI は stderr、回答と機械向けの結果は stdout に出します。利用側は回答を捕捉して業務に使えます。[API v1](docs/api.md)に呼び出し方、データ形式、終了コード、秘密値の扱い、上限を定めています。

## ビルドして使う

ソースからの開発とビルドには、`nix-command` と `flakes` が有効な Nix を使用します。開発 shell は Apple Silicon の macOS と ARM64 / x86_64 の Linux 向けに定義しています。リポジトリ直下で実行してください。

```sh
./scripts/dev.sh bun run setup
./scripts/dev.sh bun run build
./dist/hamio capabilities
sh examples/form.sh
```

`setup` は固定した依存を取得し、この clone に Git hooks を導入します。`build` はホストの OS・CPU 向けに本体・製品依存・Bun を同梱した `dist/hamio` を生成します。生成した実行ファイルの UI を使うために、Bun・Node.js・Nix を導入する必要はありません。業務処理に必要な実行環境は利用側で用意します。

利用例は [Shell](examples/form.sh)、[Python](examples/form.py)、[フォーム定義](examples/form.json)、[表示定義](examples/display.json)を参照してください。

## 開発と UI の確認

日常の開発は `nix develop` 内で行い、format、対象のテスト、UI 確認、全体検査を実行します。Git hooks と PR の CI も検査します。

```sh
./scripts/dev.sh bun run format
./scripts/preview.sh
./scripts/dev.sh bun run check
```

プレビューは実際の端末出力から生成します。生成元と画像が一致すれば再利用し、更新が必要な場合に録画と描画を行います。操作途中の GIF は `./scripts/preview.sh --recording`、必ず再生成する場合は `--force` を指定します。

[プレビュー一覧](docs/previews/README.md)の `product` は製品 CLI、`fixture` は録画基盤の確認用です。画像の共有方法と検査の範囲は[開発手順](docs/development.md)に記載しています。

## 実装・検証・配布の状況

API v1、対話フォーム、単発表示、進捗ストリーム、ローカルの実行ファイル生成を実装しています。macOS arm64 では契約、PTY、同梱実行ファイルを検証し、性能の初期測定を[製品 API の性能評価](docs/research/api-performance.md)に記録しています。Linux は PR の CI で同じテストを実行する構成で、Linux 上の実行結果は未確認です。

署名・provenance・SBOM を伴う公開リリースは未提供です。最低 OS・CPU・libc の正式な保証、実端末とアクセシビリティの対応範囲、全性能予算の達成は、[リリースの受け入れ条件](docs/design.md#12-リリースの受け入れ条件)に従って判定します。

## 文書案内

| 文書                               | 読む目的                                                       |
| ---------------------------------- | -------------------------------------------------------------- |
| [基本設計](docs/design.md)         | 製品の目的、責務、品質条件、安全性、開発・配布方針を理解する   |
| [API 契約](docs/api.md)            | 利用側のスクリプトから CLI と JSON で接続する                  |
| [実装設計](docs/implementation.md) | モジュール、データフロー、状態の寿命、ランタイム構成を理解する |
| [開発手順](docs/development.md)    | 環境構築、検査、Git hooks、CI、プレビューを実行する            |
| [AGENTS.md](AGENTS.md)             | AI エージェントの作業規則と領域別スキルを確認する              |

一次情報の調査と測定資料は、基本設計の[根拠資料](docs/design.md#根拠資料)から参照できます。
