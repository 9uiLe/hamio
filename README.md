# hamio

hamio は、開発用スクリプトの入力フォーム、進捗、表、結果を統一するターミナル UI ツールです。利用側は Shell、Python、Go、TypeScript などで業務処理を実装し、CLI と JSON を通じて UI を hamio に委譲します。

人向けにはフォームと見やすい表示を、AI エージェントや CI 向けには非対話入力と必要な情報に絞った構造化出力を提供する設計です。業務の実行順序や並列数は利用側が管理し、hamio は起動時間、メモリ、CPU、出力量を含む追加負荷を性能予算で評価します。

本体は Bun + TypeScript で開発し、macOS / Linux 向けにランタイムを同梱した実行ファイルとして配布します。UI の利用に Bun・Nix の導入は要求しません。hamio 自体の開発環境は Nix で管理します。

## 実装状況

Nix 開発環境、Lint・format・型検査、Git hooks、品質検査 workflow、開発用スキルを用意しています。製品本体と配布物は未実装で、製品の動作試験・性能測定結果はありません。

## 文書

[基本設計](docs/design.md)は製品の責務、公開契約、性能、安全性、開発・配布方針を定めます。[開発環境と検査](docs/development.md)は、セットアップ、日常のコマンド、Git hooks、GitHub Actions、開発用スキルを説明します。

設計の根拠となる一次情報は、次の技術資料にまとめています。

- [UI と言語間連携](docs/research/ui-and-integration.md)
- [ランタイムとサプライチェーン](docs/research/runtime-and-supply-chain.md)
- [性能特性と測定](docs/research/performance.md)

## 開発を始める

開発環境は Apple Silicon の macOS と、ARM64 / x86_64 の Linux を対象とします。`nix-command` と `flakes` が有効な Nix を用意し、リポジトリ直下で実行します。

```sh
./scripts/dev.sh bun run setup
./scripts/dev.sh bun run check
```

セットアップは固定した開発依存を取得し、この clone の Git hooks を有効にします。Bun・Node.js・検査ツールは Nix 環境から利用します。Nix の導入条件と日常の作業は[開発手順](docs/development.md)を参照してください。

AI エージェントの作業規則は [AGENTS.md](AGENTS.md)を入口にし、設計、TypeScript、パフォーマンスの各スキルを作業内容に応じて参照します。
