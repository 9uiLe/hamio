# hamio

hamio は、開発用スクリプトの入力フォーム、進捗、表、結果を統一するターミナル UI ツールです。Shell、Python、Go、TypeScript などから CLI と JSON で呼び出し、入力と表示を委譲できます。

業務処理は利用側のスクリプトに残します。hamio は質問の表示、回答の検証、状態の表示を担当し、業務の実行順序、並列数、権限、再試行は利用側が管理します。hamio を利用するための言語別 SDK は必要ありません。

## 利用できる機能

| コマンド       | 用途                                                                     |
| -------------- | ------------------------------------------------------------------------ |
| `form`         | 文字入力、確認、単一選択、複数選択、秘密入力を受け取り、回答や不足を返す |
| `render`       | メッセージ、値の一覧、表、進捗、結果、エラーを単発で表示する             |
| `stream`       | 改行区切りの JSON で状態を受け取り、進捗と結果を表示する                 |
| `capabilities` | 契約版、対応機能、資源上限を必要な範囲で照会する                         |

人向け UI は標準エラー出力（stderr）、回答と機械向けの結果は標準出力（stdout）へ出します。フォームの回答は対話時も JSON なので、利用側が捕捉して業務処理に使えます。

AI エージェントや CI では `form --interactive never`、`render / stream --format json` を使います。対話待ちと装飾を避け、連続表示の既定出力は最終結果だけとします。業務の成否と UI 自身の終了状態は区別します。詳細は [API v1](docs/api.md)に定めています。

## ビルドして使う

開発とビルドには、`nix-command` と `flakes` が有効な Nix を使います。開発 shell は Apple Silicon の macOS と ARM64 / x86_64 の Linux 向けです。リポジトリ直下で実行してください。

```sh
./scripts/dev.sh bun run setup
./scripts/dev.sh bun run build
./dist/hamio capabilities
sh examples/form.sh
```

`setup` は固定した依存を取得し、この clone に Git hooks を導入します。`build` はホストの OS・CPU 向けに、本体・製品依存・Bun を同梱した `dist/hamio` を生成します。生成した実行ファイルの UI 利用に Bun・Node.js・Nix は不要です。利用側の業務処理に必要な言語ランタイムは、利用側で用意します。

転送用の圧縮候補は `./scripts/dev.sh bun run package` で `dist/hamio.gz` に生成します。公開リリースの署名や配布は、このローカルビルドとは別の工程です。

呼び出し例は [Shell](examples/form.sh)、[Python](examples/form.py)、要求データの例は[フォーム定義](examples/form.json)と[表示定義](examples/display.json)を参照してください。

## 開発する

日常の編集と実行は `nix develop` 内で行います。shell 外からも `scripts/dev.sh` を通して固定した環境を使えます。

```sh
./scripts/dev.sh bun run format
./scripts/preview.sh
./scripts/dev.sh bun run check
```

format の差分を確認し、変更対象のテストと全体検査を実行します。UI を変更した場合は、実際の製品 CLI から生成した PNG を開いて見た目を確認します。操作過程の GIF は `./scripts/preview.sh --recording` で用意できます。

[プレビュー一覧](docs/previews/README.md)の `product` は製品 UI、`fixture` は録画基盤の確認用です。生成元と画像が一致する場合は再利用します。Git hooks と PR の CI は Lint、format、型、テスト、プレビュー照合を検査します。各工程の対象と PR・チャットでの画像共有は[開発手順](docs/development.md)に記載しています。

## 設計と文書

内部は契約・状態、処理手順、I/O、表示計算に分けています。端末操作と timer をアダプターへ閉じ、色や幅を明示的な値として渡します。event の出力をまとめ、進捗の文字列は描画時だけ生成して、利用側と共有する CPU・メモリの負荷を抑えます。

| 文書                               | 読む目的                                                 |
| ---------------------------------- | -------------------------------------------------------- |
| [基本設計](docs/design.md)         | 目的、責務、構成、性能、安全性、開発・配布方針を理解する |
| [API 契約](docs/api.md)            | 利用側からのコマンド、JSON、終了状態、制約を確認する     |
| [実装設計](docs/implementation.md) | 依存方向、処理の流れ、状態と資源の所有者を理解する       |
| [開発手順](docs/development.md)    | Nix、検査、Git hooks、CI、プレビュー、計測を実行する     |
| [AGENTS.md](AGENTS.md)             | AI エージェントの作業規則と領域別スキルを確認する        |

一次情報と測定資料は、基本設計の[根拠資料](docs/design.md#根拠資料)から参照できます。

## 実装と検証の範囲

API v1 の対話フォーム、単発表示、進捗ストリーム、機能照会、ローカルの実行ファイル・gzip 生成を実装しています。macOS arm64 で契約、PTY、同梱実行ファイルを検証しています。サイズ、処理時間、同時実行、入力応答は[性能測定記録](docs/research/refactor-performance.md)に対象ソースと条件を添えて保存しています。

Linux は PR の CI で同じ試験を実行する構成です。現在の実装に対する Linux 上の実行結果は未確認です。最低 OS・CPU・libc、実端末、アクセシビリティ、全性能予算の保証範囲は、配布対象ごとの試験で判定します。

署名・provenance・SBOM を伴う公開リリースは未提供です。[リリースの受け入れ条件](docs/design.md#12-リリースの受け入れ条件)に、公開に必要な試験と配布検証を定めています。
