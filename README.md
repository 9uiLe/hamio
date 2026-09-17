# hamio

hamio は、開発用スクリプトの入力フォーム、進捗、表、結果を共通化するターミナル UI ツールです。利用側は Shell、Python、Go、TypeScript などで業務処理を実装し、CLI と JSON を通じて対話と表示を hamio に委譲します。

業務の実行順序、並列数、権限、再試行は利用側が管理します。hamio は人向けの端末 UI と、AI エージェント・CI 向けの非対話入力と構造化出力を提供する設計です。起動、メモリ、CPU、出力量、業務への追加負荷を性能予算で評価します。

本体は Bun + TypeScript で開発し、macOS / Linux 向けにランタイムを同梱した実行ファイルとして配布します。UI の利用に Bun・Nix の導入は要求しません。hamio 自体の開発環境は Nix で管理します。

## 実装範囲

| 領域             | 状態                                                                         |
| ---------------- | ---------------------------------------------------------------------------- |
| 開発環境         | Nix、固定した JS 依存、エディタ設定を利用できます                            |
| 品質検査         | Lint・format・型検査、Git hooks、PR の CI、開発基盤のテストを利用できます    |
| UI レビュー      | 疑似端末の出力から PNG・GIF を生成し、PR・チャットで確認できます             |
| 製品本体・配布物 | 未実装です。CLI・JSON の詳細契約と配布条件は基本設計に確定項目を定めています |
| 製品の検証結果   | 製品の動作試験・性能測定結果はありません                                     |

[プレビュー一覧](docs/previews/README.md)の画像は録画基盤を確認するためのサンプルです。製品 UI の実装を示すものではありません。

## 開発を始める

Apple Silicon の macOS、ARM64 / x86_64 の Linux を開発対象とします。`nix-command` と `flakes` が有効な Nix を用意し、リポジトリ直下で実行します。

```sh
./scripts/dev.sh bun run setup
./scripts/dev.sh bun run check
```

セットアップは固定した依存を取得し、この clone の Git hooks を有効にします。Bun・Node.js・検査ツールは Nix 環境から利用します。

端末プレビューは次のコマンドで生成できます。PNG を開いて見た目を確認し、入力や状態遷移を確認する場合は録画も生成します。

```sh
./scripts/preview.sh
./scripts/preview.sh --recording
```

環境の導入条件、編集時の支援、検査、画像の掲載方法は[開発手順](docs/development.md)にまとめています。

## 文書の読み方

| 文書                                      | 内容                                                           |
| ----------------------------------------- | -------------------------------------------------------------- |
| [基本設計](docs/design.md)                | 製品の責務、公開契約、性能、安全性、プレビュー、開発・配布方針 |
| [開発手順](docs/development.md)           | セットアップ、日常のコマンド、Git hooks、CI、UI の確認と共有   |
| [プレビュー一覧](docs/previews/README.md) | シナリオごとの代表画像と確認範囲                               |
| [AGENTS.md](AGENTS.md)                    | AI エージェントの作業規則と領域別スキルへの入口                |

判断根拠は次の技術資料を参照してください。

- [UI と言語間連携](docs/research/ui-and-integration.md)
- [ランタイムとサプライチェーン](docs/research/runtime-and-supply-chain.md)
- [性能特性と測定](docs/research/performance.md)
- [CI の構成と測定](docs/research/ci.md)
