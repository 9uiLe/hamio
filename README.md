# hamio

hamio は、開発用スクリプトの質問、進捗、表、結果を統一するターミナル UI ツールです。Shell、Python、Go、TypeScript などからコマンドラインと JSON で呼び出します。業務処理の順序、並列数、権限、再試行は利用側が管理します。

## 導入

macOS arm64 と Linux x64 / arm64（glibc）向けの単一実行ファイルを配布します。通常実行に Bun・Node.js・Nix は不要です。

[導入・更新手順](docs/distribution.md#リポジトリへの導入)に従い、公開版を `.hamio-version` に完全な `vX.Y.Z` で固定し、証明を検証して `.tools/bin/hamio` へ配置してください。通常起動で通信や更新確認は行いません。公開版 [v0.1.0](https://github.com/9uiLe/hamio/releases/tag/v0.1.0) の検証結果と未確認範囲は[リリース評価](docs/release-readiness.md)にあります。

Nix を使う場合:

```sh
nix run github:9uiLe/hamio#hamio -- --version
nix profile add github:9uiLe/hamio#hamio
```

flake input・lockfile への組み込み、製品版と flake commit の固定、ロールバックは [Nix の導入手順](docs/distribution.md#nix-で導入する)を参照してください。

## スクリプトから使う

| コマンド       | 用途                                               |
| -------------- | -------------------------------------------------- |
| `form`         | 文字入力、確認、単一選択、複数選択、秘密入力を取得 |
| `render`       | メッセージ、値の一覧、表、進捗、結果、エラーを表示 |
| `stream`       | 改行区切りの JSON で受け取った業務の状態を表示     |
| `capabilities` | 契約版、製品版、対応機能、資源上限を照会           |

人向け UI は stderr、回答と機械向けの結果は stdout の JSON に出力します。業務の成否と UI 操作の終了コードは別に判断します。

AI エージェントと CI は `form --interactive never` または `render / stream --format json` を指定します。stream は既定で最終応答一つを返し、全 event の応答が必要な場合は `--events` を使います。

データ形式と終了コードは [API 契約](docs/api.md)、接続例は [Shell](examples/form.sh)・[Python](examples/form.py)、CI への導入は [GitHub Actions の手順](docs/distribution.md#github-actions-で使う)を参照してください。

## 開発する

`nix-command` と `flakes` が有効な Nix を用意し、clone の直下で実行します。

```sh
./scripts/dev.sh bun run setup
./scripts/dev.sh bun run check
```

setup は固定依存を取得し、この clone に Git hooks を導入します。ビルド・検査・UI 確認・性能測定は[開発手順](docs/development.md)、画像は[製品プレビュー](docs/previews/README.md)を参照してください。

- [基本設計](docs/design.md): 製品の責務、依存境界、設計理由、性能目標。
- [配布手順](docs/distribution.md#保守者のリリース工程): 候補検証、承認、公開、導入試験、障害復旧。
- [AGENTS.md](AGENTS.md): AI エージェントの作業規則。
- [セキュリティ方針](SECURITY.md): 非公開報告、サポート、修正版の提供。

## ライセンス

hamio 本体は [MIT License](LICENSE) です。第三者のコードには各部品のライセンスが適用されます。配布物の通知・SBOM と、Bun 内部の在庫の制約は[配布手順](docs/distribution.md#配布物と在庫情報)に記載しています。
