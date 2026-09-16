# ランタイムとサプライチェーンの技術資料

確認日: 2026-09-17。対象は、Bun を同梱した UI 実行ファイル、Nix による開発環境、依存取得、配布物の検証である。hamio の採用方針は [基本設計](../design.md) に定める。外部仕様は採用する固定版で確認し、配布物の動作は実機で検証する。

## 実行ファイルの生成と対応環境

`bun build --compile` は JavaScript / TypeScript、読み込む依存、Bun ランタイムを実行ファイルへまとめる。クロスコンパイルに対応し、OS・CPU 別の配布物を生成できる。Linux には glibc / musl 向けの対象がある。[Bun: Single-file executable](https://bun.com/docs/bundler/executables)

この機能は、利用者による Bun の事前導入を不要にする構成の根拠となる。UI ライブラリの動作、native assets、メモリ、起動時間、利用側との入出力は、配布する組み合わせごとに検証する必要がある。

| 項目 | 確認日の Bun 公式文書にある条件 |
| --- | --- |
| macOS | 13.0 以降、x64 / arm64 |
| Linux | glibc 2.17 以降、または musl 用バイナリ。kernel 5.6 以降を推奨 |
| x64 CPU | SSE4.2 が必要。baseline / modern は同じバイナリに解決される |

出典: [Bun: Installation](https://bun.com/docs/installation)。この表は Bun の条件であり、hamio の動作保証表ではない。hamio は macOS と Linux を対象とし、CPU・最低 OS・libc の正式な範囲をリリース前に定める。

Linux の最低 kernel は、インストール文書に 3.10 までの縮退動作の説明がある一方、公式 README は 5.1 を最低としている。古い Linux の対応可否は文書だけで確定せず、固定した Bun 版で検証する。[Bun: Installation](https://bun.com/docs/installation)、[oven-sh/bun README](https://github.com/oven-sh/bun)

## 実行時の信頼境界

standalone executable は既定で `.env` と `bunfig.toml` を読み込む。ビルド時の `--no-compile-autoload-dotenv` と `--no-compile-autoload-bunfig` で無効化できる。[Bun: executable configuration](https://bun.com/docs/bundler/executables)

実行ファイルは `BUN_OPTIONS` を受け付け、`BUN_BE_BUN=1` では同梱 entrypoint を無視して Bun CLI として動く。これらはアプリの開始前にも作用するため、起動後に環境変数を削除するだけでは対策にならない。[Bun: Bun CLI mode](https://bun.com/docs/bundler/executables)

Bun の通常実行には、`node_modules` が見つからない場合の依存自動取得がある。宣言がなければ `latest` が使われる経路もある。ランタイムには `--no-install` が用意されている。[Bun: Auto-install](https://bun.com/docs/runtime/auto-install)、[Bun: Runtime](https://bun.com/docs/runtime)

hamio は UI コードを配布物へ含め、利用側コードの動的読み込みと依存取得を基本経路に設けない。暗黙の設定読み込みを無効化し、利用側ディレクトリの設定やネットワークに依存せず動くことを確認する。起動環境を制御する仕組みの要否は脅威モデルに基づいて定める。

ランタイム同梱は、利用側の Python・Git 等の用意、OS 権限の隔離、任意コードの安全な実行を提供するものではない。hamio は利用者と同じ権限で動くローカルツールとして扱う。

## プロセスと資源管理の API

`Bun.spawn` は引数配列、標準入出力、終了コード、AbortSignal、timeout を扱う。timeout の既定終了シグナルは SIGTERM。`resourceUsage()` は終了後の利用量を返す観測 API であり、上限制御ではない。`maxBuffer` の説明は同期実行 `spawnSync` が対象である。[Bun: Spawn](https://bun.com/docs/runtime/child-process)

Bun の Linux cgroup 指定は CPU、メモリ、プロセス数を子孫込みで制限できるが、通常は root または委譲済み subtree が必要で、他 OS では無視される。これを macOS / Linux 共通の資源制限として採用することはできない。[Bun: Spawn](https://bun.com/docs/runtime/child-process)

これらの API は、測定用プロセスや Bun から hamio を呼ぶ連携の参考となる。hamio 自体による業務プロセスの起動・管理は初期設計の対象外である。利用側は必要な出力を継続して読み、UI 終了と業務終了を別に扱う。

hamio 内では受信メッセージ、待ち行列、表示ログの保持量を制限する。アプリ内の上限、プロセス全体のメモリ上限、計測結果を区別する。詳細な測定指標は [性能資料](performance.md) に記載する。

## 開発環境と依存取得

Nix は `devShells`、`nix develop --command`、flake の lockfile を提供する。hamio ではツールチェーンを `flake.lock`、JS 依存を `bun.lock` で管理し、ローカルと CI の定義を共有する。[Nix 2.35: develop](https://nix.dev/manual/nix/2.35/command-ref/new-cli/nix3-develop)、[Nix 2.35: flake](https://nix.dev/manual/nix/2.35/command-ref/new-cli/nix3-flake)

参照する Nix 2.35 文書には両コマンドの experimental 注記がある。Nix の採用版、必要な feature 設定、導入経路、信頼するキャッシュを明記する。開発 shell の固定と、隔離ビルド・バイト単位の再現性は別の検証対象とする。

| 機能 | 公式仕様と制約 |
| --- | --- |
| [bun ci / frozen lockfile](https://bun.com/docs/pm/cli/install) | 宣言と lockfile の不一致で失敗する。`--ignore-scripts` はルートと trusted dependencies を含む lifecycle scripts を止める |
| [lifecycle scripts](https://bun.com/docs/pm/lifecycle) | 既定の許可リストがあり、`trustedDependencies: []` はそれを置き換える。Bun がすべての依存スクリプトを常に禁止するわけではない |
| [minimumReleaseAge](https://bun.com/docs/pm/cli/install#minimum-release-age) | 新しい依存解決に適用する。既存 lockfile の版は変わらず、timestamp のない版は age 判定を通過する |
| [bun audit](https://bun.com/docs/pm/cli/audit) | パッケージ名と版を NPM へ送って既知の脆弱性を調べる。既定以外の registry 由来は対象外 |

hamio は Bun と依存を固定し、通常の CI では lockfile の変更と lifecycle scripts の暗黙実行を禁止する。必要なビルド処理は個別に明示する。公開からの待機期間を使う場合は、緊急セキュリティ更新の例外手順も必要になる。

GitHub は Actions と再利用 workflow の完全な commit SHA 固定、コードの確認、最小権限を推奨する。キャッシュ、ダウンロードする補助ツール、Nix の取得元もビルドの信頼対象に含まれる。[GitHub: Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use)

版固定と脆弱性検査は、未発見の悪意や保守元の侵害を排除する証明ではない。配布工程ではソース、依存、Bun 版、ビルド設定、生成物を対応付け、ビルドと公開の権限を分離する。

## 配布物の検証

GitHub の artifact attestations は public repository で利用でき、ビルドの provenance と SPDX / CycloneDX 形式の SBOM を証明対象にできる。生成する job には必要な OIDC・attestations 権限を与える。[GitHub: Using artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)

attestation は資産の由来とビルド工程を関連付ける。コードの安全性を保証するものではなく、利用時に検証する必要がある。[GitHub: Artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations)

`gh attestation verify` は repository、signer workflow、source ref / digest 等を検証条件にできる。workflow が生成できる値と、証明書から得る identity は区別して扱う。[GitHub CLI: attestation verify](https://cli.github.com/manual/gh_attestation_verify)

hamio の配布手順では `9uiLe/hamio`、期待する公開 workflow、ソース ref / commit を検証条件にする。バイナリと checksum が同時に差し替えられる場合もあるため、checksum の一致だけで配布元の正当性を判断しない。

immutable releases は公開後の添付資産の変更とタグ移動を防ぎ、release attestation を生成する。資産を draft に揃えてから公開する運用が案内されている。[GitHub: Immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)

release attestation による公開資産との一致と、build provenance によるビルドの由来は別の確認である。前者には `gh release verify` と `gh release verify-asset` が用意されている。[GitHub: Verify release integrity](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/verify-release-integrity)

検証ツールを入手する経路も信頼対象となる。新しく取得した hamio 自身を、初回取得の正当性を保証する唯一の手段にしない。更新は版を選ぶ明示操作とし、検証に失敗した資産は実行・置換しない。

## SBOM の対象範囲

SBOM はソフトウェアに含まれる部品を列挙する情報である。[Syft v1.46.0](https://github.com/anchore/syft/releases/tag/v1.46.0) は `bun.lock` 対応を追加しており、JS 依存一覧を生成する候補となる。

lockfile の部品一覧と最終バイナリの同梱コードが一致するか、Bun、JavaScriptCore、OS 別 native 部品まで追跡できるかは、出荷物との照合が必要である。Bun 単体で完全な SBOM を生成できることを前提にしない。

生成方法を固定し、JS 依存、同梱ランタイム、追加 native 部品ごとに対象範囲と不足を明示する。部品、版、取得元、ライセンスを追跡する。attestation を付けることと、一覧の完全性を確かめることは別の作業である。

## 配布前の検証対象

- 対応する OS・CPU で UI、キー入力、描画、native assets が機能すること。
- Bun・Nix 未導入環境で動作し、通常実行にネットワーク取得や `/nix/store` が不要であること。
- 利用側の `.env`・`bunfig.toml`、起動時の環境変数、巨大入力、中断の挙動が仕様に一致すること。
- 改ざん、別 workflow、想定外ソース commit、検証失敗の配布物を拒否すること。
- SBOM を出荷物と照合し、起動・メモリ・CPU・業務への追加時間を基本設計の性能予算で評価すること。

これらは検証計画であり、hamio の実装・試験結果は未提供である。
