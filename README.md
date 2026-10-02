# hamio

hamio は、Script / AI / Application が人へ提示する状態と内容を標準化する native CLI です。利用側は Presentation Protocol v2 の意味を宣言し、hamio が Terminal 表示、受理済み Event の記録と self-contained HTML Report を担当します。業務処理、権限、並列数、再試行、Run Result は利用側が決めます。Shell、Python、Go、TypeScript などから同じ CLI と JSON を使用できます。

## 導入

macOS arm64 と Linux x64 / arm64（glibc）向けの単一実行ファイルを配布します。通常実行に Bun・Node.js・Nix は不要です。[導入・更新手順](docs/distribution.md)では公開版を `vX.Y.Z` で固定し、証明を検証して配置します。通常起動で通信や更新確認は行いません。

公開済み [v0.1.0](https://github.com/9uiLe/hamio/releases/tag/v0.1.0) は旧 API v1 です。現在の master と次の配布候補には下記の入口があり、旧 `render` / `stream` / root `capabilities` は含みません。[移行ガイド](docs/migration-v1-to-presentation-v2.md)を参照してください。Phase 11 のためだけに新しい release は公開しません。

## Presentation

```sh
./dist/hamio presentation capabilities
./dist/hamio presentation static --input examples/presentation-static.json
sh examples/presentation-live.sh ./dist/hamio succeeded
sh examples/presentation-live.sh ./dist/hamio succeeded --record run.ndjson
./dist/hamio presentation report --input run.ndjson --output run.html
```

`static` は State、`live` は Event 列を受け取ります。人向け Terminal 表示は stderr、機械向け応答は stdout。Recording の完結性、Run の業務結果、hamio の処理結果は独立しています。[Presentation API](docs/presentation-api.md)と[Recording 形式](docs/presentation-recording.md)が公開契約です。

## Form interaction

`hamio form --definition examples/form.json` は対話または提供値から回答を取得します。Form は Presentation と別の Interaction capability で、schema と応答は `apiVersion: 1` を維持します。[Form 契約](docs/interaction-form.md)、[Shell](examples/form.sh)・[Python](examples/form.py) の例を参照してください。

## 開発

```sh
./scripts/dev.sh bun run setup
./scripts/dev.sh bun run check
./scripts/dev.sh bun run build
```

[基本設計](docs/design.md)、[開発手順](docs/development.md)、[配布手順](docs/distribution.md)、[Catalog](docs/development.md#9-semantic-catalog-と-renderer-review)、[AGENTS.md](AGENTS.md)を参照してください。

## ライセンス

hamio 本体は [MIT License](LICENSE) です。第三者部品の通知・SBOM は[配布手順](docs/distribution.md#配布物と在庫情報)に記載しています。
