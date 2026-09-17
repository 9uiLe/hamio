# hamio

hamio は、開発用スクリプトの入力フォーム、進捗、表、結果を統一するターミナル UI ツールです。利用側は Shell、Python、Go、TypeScript などで業務処理を実装し、CLI と JSON を通じて入力と表示を hamio に委譲します。

業務の実行順序、並列数、権限、再試行は利用側が管理します。hamio は人向けの端末 UI と、AI エージェント・CI 向けの非対話入力と構造化出力を提供する設計です。起動、応答、メモリ、CPU、出力量、業務への追加負荷を品質条件として定めています。

本体は Bun + TypeScript で開発し、macOS / Linux 向けにランタイムを含む実行ファイルとして配布します。UI の利用に Bun・Nix の導入は要求しません。hamio 自体の開発には Nix を使用します。

## 実装状況

| 領域             | 状態                                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| 開発環境         | Nix、固定した JS 依存、エディタ設定を利用できます                                                              |
| 品質検査         | Lint・format・型検査、Git hooks、PR の CI、開発基盤のテストを利用できます                                      |
| UI レビュー      | 実際の疑似端末出力から PNG・GIF を生成し、PR・チャットで確認できます。最新の生成物は内容を検証して再利用します |
| 製品本体・配布物 | 未実装です。公開契約と配布条件の詳細は基本設計の確定項目に記載しています                                       |
| 製品の検証結果   | 製品の動作試験・性能測定結果はありません                                                                       |

[プレビュー一覧](docs/previews/README.md)にある `fixture` は録画基盤の検証用プログラムです。画像は製品 UI の実装を示すものではありません。

## 開発を始める

開発環境は Apple Silicon の macOS、ARM64 / x86_64 の Linux を対象とします。`nix-command` と `flakes` が有効な Nix を用意し、リポジトリ直下で実行してください。

```sh
./scripts/dev.sh bun run setup
./scripts/dev.sh bun run check
```

セットアップは固定した依存を取得し、この clone の Git hooks を導入します。日常の開発は `nix develop` 内で行います。導入条件、エディタ設定、検査の手順は[開発手順](docs/development.md)を参照してください。

UI の確認には次を使います。生成元と画像が一致すれば既存画像を再利用し、更新が必要な場合は録画と描画を実行します。

```sh
./scripts/preview.sh
# 操作途中も確認する場合
./scripts/preview.sh --recording
```

PNG を開いて見た目を確認し、入力や状態遷移は GIF でも確認します。端末を必ず再実行する場合は `--force` を指定します。

## 文書案内

| 文書                                      | 内容                                                   |
| ----------------------------------------- | ------------------------------------------------------ |
| [基本設計](docs/design.md)                | 製品の責務、公開契約、性能、安全性、開発・配布方針     |
| [開発手順](docs/development.md)           | セットアップ、コマンド、Git hooks、CI、UI の確認と共有 |
| [プレビュー一覧](docs/previews/README.md) | シナリオごとの代表画像と確認範囲                       |
| [AGENTS.md](AGENTS.md)                    | AI エージェントの作業規則と領域別スキル                |

技術的な判断と測定条件は、次の資料に記載しています。

- [UI と言語間連携](docs/research/ui-and-integration.md)
- [ランタイムとサプライチェーン](docs/research/runtime-and-supply-chain.md)
- [性能特性と測定](docs/research/performance.md)
- [CI の構成と測定](docs/research/ci.md)
- [プレビューの性能評価](docs/research/preview-performance.md)
