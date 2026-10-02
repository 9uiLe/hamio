# hamio の開発

[基本設計](docs/design.md)を製品責務、[Presentation API](docs/presentation-api.md)・[Form 契約](docs/interaction-form.md)・[Recording 形式](docs/presentation-recording.md)を公開契約、[開発手順](docs/development.md)をツールと検査の正本とする。業務処理は利用側に残す。

## 作業の入口

- 初回は `./scripts/dev.sh bun run setup`。固定した Nix 環境で依存を取得し、この clone の Git hooks を導入する。
- 開発中は `nix develop` を使う。依存は `bun.lock`、開発ツールは `flake.lock` で固定する。
- 変更後は対象に合う検査を行い、完了前に `./scripts/dev.sh bun run check` を通す。検証不能な環境は結果に明記する。
- format は `./scripts/dev.sh bun run format`。自動修正の差分を確認する。検査を通すためだけにルール、型検査、hooks を無効化しない。
- 依存追加・更新は[依存とツールの更新](docs/development.md#7-依存とツールの更新)に従い、取得元・差分・lifecycle scripts・lockfile を確認する。

## UI の確認

- Presentation UI を変更したら `./scripts/dev.sh bun run catalog:check` を実行し、必要に応じて固定 preview shell の `bun scripts/catalog/capture.ts` で実 PTY の代表 PNG を更新する。HTML Report は native executable が生成したファイルを browser で確認する。
- 追跡 PNG は画像として開いて確認する。チャットでは代表画像をインライン表示し、PR 本文には対象 commit SHA に固定したリンクと確認範囲を記載する。[Catalog 手順](docs/development.md#9-semantic-catalog-と-renderer-review)に従う。
- Form の対話表示を変更したら、現行 `hamio form` を実 PTY で確認する。Catalog の Semantic Scenario を Form の fixture と誤認しない。

## スキルの選択

必要な領域だけ読む。単純な文書修正で全スキルを読み込まない。

- 入出力、状態遷移、モジュール境界を設計・変更する場合: [hamio-software-design](.agents/skills/hamio-software-design/SKILL.md)
- TypeScript を実装・変更・レビューする場合: [hamio-typescript](.agents/skills/hamio-typescript/SKILL.md)
- 起動、CPU、メモリ、通知量、並列性を変更・調査する場合: [hamio-performance](.agents/skills/hamio-performance/SKILL.md)

スキルは作業範囲を広げる権限ではない。製品実装、外部投稿、公開などは依頼された範囲で行う。
