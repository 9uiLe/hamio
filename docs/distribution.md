# hamio 導入・更新・リリース

hamio は、本体・製品依存・Bun を含む単一実行ファイルを GitHub Releases で配布する。利用側は採用する版を固定し、検証した実行ファイルを自分のリポジトリへ配置する。通常実行に Bun・Node.js・Nix は不要であり、業務処理の言語ランタイムは利用側が用意する。

本書は利用者の導入・更新と、保守者の梱包・公開を定める。公開コマンドは [API 契約](api.md)、製品の責務と品質条件は[基本設計](design.md)、実装・検証・公開の状態は [README](../README.md)を参照する。

## 配布方式と対象環境

| 配布対象       | ビルド・実行試験の runner   |
| -------------- | --------------------------- |
| `darwin-arm64` | macOS 15、Apple Silicon     |
| `linux-x64`    | Ubuntu 24.04、x86_64、glibc |
| `linux-arm64`  | Ubuntu 24.04、ARM64、glibc  |

各 OS・CPU の runner で CLI、PTY、同梱実行ファイルを試験する。対象リリースで確認した環境をリリースノートに記載し、古い OS、Intel Mac、Windows、musl、すべての端末を保証対象には含めない。x64 の Bun ランタイムは SSE4.2 以上を要求する。[Bun の CPU 要件](https://bun.com/docs/installation#cpu-requirements)

製品版は `package.json` の `version` を実行ファイルへ埋め込み、同じ版の `vX.Y.Z` タグで公開する。インストーラーは完全な版指定だけを受け付ける。`latest`、範囲指定、暗黙の更新は設けない。入出力の契約版 `apiVersion` は製品版と独立して管理する。

## 配布物と在庫情報

hamio 本体は [MIT License](../LICENSE) で提供し、著作権表記は `Copyright (c) 2026 9uiLe` とする。`package.json` の `license` は `MIT` とし、配布する notices に本体のライセンス全文を含める。同梱する第三者のコードには各部品のライセンスが適用される。

| 公開資産                          | 内容                                                                              |
| --------------------------------- | --------------------------------------------------------------------------------- |
| `hamio-vX.Y.Z-<対象>.gz`          | 単一実行ファイルの gzip                                                           |
| `hamio-vX.Y.Z-<対象>.sha256`      | gzip と展開後 `hamio` の SHA-256                                                  |
| `hamio-vX.Y.Z-<対象>.spdx.json`   | 本体、production npm 依存、Bun の SPDX 2.3 在庫                                   |
| `hamio-vX.Y.Z-<対象>.notices.txt` | 本体と npm のライセンス本文、Bun の提供元の notices、ソース・再リンク手順への参照 |
| `install.sh`                      | macOS の梱包時に生成する共通の POSIX インストーラー                               |

SBOM（Software Bill of Materials）は配布物に含まれる部品の在庫情報である。ソース commit、作業ツリーの変更有無、lockfile hash、実行ファイル・gzip・同梱 Bun の hash、production npm の解決版と取得元を記録する。本体の `licenseDeclared` は `MIT` とし、開発ツールを製品依存へ含めない。

Bun は native ライブラリと polyfill を含む一つの部品として記録する。この扱いを aggregate と呼ぶ。内部部品の個別の版・ライセンスを網羅的に確定した在庫ではなく、未確認のライセンスは `NOASSERTION` とする。証明の署名は在庫の網羅性や脆弱性の不存在を保証しない。

Bun は MIT の本体に加え、LGPL の JavaScriptCore と他の native ライブラリを含む。[固定した提供元の notices](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/LICENSE.md)に従って再リンク用の Bun を生成できる。hamio の同じタグのソースと固定依存を用意し、`HAMIO_BUN_RUNTIME` にその Bun を指定して `bun scripts/build.ts` を実行する。独自ビルドは公式資産の hash・証明の対象にはならない。公開者は各部品の許諾・通知・ソース提供条件を確認する。

## 導入時の前提と信頼条件

導入・更新は GitHub への通信を伴い、GitHub CLI、POSIX shell、gzip、`sha256sum` または `shasum` を使う。GitHub CLI は2.100.0で動作確認しており、`release verify`、`release verify-asset`、`attestation verify --source-digest` が必要である。[公式の導入経路](https://cli.github.com/)で用意し、認証済みの CLI または読み取り用 `GH_TOKEN` を使う。

| 検証対象            | 信頼条件                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------- |
| 公開元              | GitHub.com の `9uiLe/hamio`                                                                   |
| リリース            | 指定タグの immutable release。公開済みタグと資産が固定されていること                          |
| release attestation | 取得した各資産が指定した公開リリースに属すること                                              |
| provenance          | `.github/workflows/release.yml`、指定タグ、タグの commit、GitHub-hosted runner に由来すること |
| 完全性              | gzip と展開後の実行ファイルの SHA-256 が一致すること                                          |
| 製品版              | 実行ファイルの `--version` が指定版と一致すること                                             |

provenance はソースとビルド工程の由来、attestation はその情報に対する署名付きの証明を指す。検証に使う GitHub CLI と、信頼するリポジトリ・workflow を導入の起点とする。取得したインストーラー自身も実行前に検証する。

配置先は信頼するユーザーだけが書き込めるディレクトリとし、root 権限を必要としない。導入後は実行ファイルへの symlink を呼び出す。通常起動に通信、版確認、補助プロセス、ランタイム取得は含めない。

## リポジトリへの導入

[リリース一覧](https://github.com/9uiLe/hamio/releases)から採用する公開版を選ぶ。以下の `v0.1.0` は版指定の形式例であり、公開を示すものではない。利用する公開版へ置き換え、利用側リポジトリの直下で実行する。公開版がない場合は[手元でビルドした実行ファイル](#手元でビルドした実行ファイル)を使う。

```sh
printf '%s\n' v0.1.0 > .hamio-version
printf '%s\n' '.tools/' >> .gitignore
```

次の手順でインストーラーを取得・検証し、利用側に保存して実行する。

```sh
(
  set -eu
  project_dir=$PWD
  tag=$(cat .hamio-version)
  export GH_HOST=github.com GH_REPO=9uiLe/hamio GH_PROMPT_DISABLED=1
  temp_dir=$(mktemp -d)
  trap 'rm -rf "$temp_dir"' EXIT
  cd "$temp_dir"
  gh release verify "$tag"
  commit=$(gh api "repos/$GH_REPO/commits/$tag" --jq .sha)
  gh release download "$tag" --pattern install.sh
  gh release verify-asset "$tag" install.sh
  gh attestation verify install.sh --repo "$GH_REPO" \
    --signer-workflow "$GH_REPO/.github/workflows/release.yml" \
    --source-ref "refs/tags/$tag" --source-digest "$commit" \
    --deny-self-hosted-runners
  mkdir -p "$project_dir/scripts"
  cp install.sh "$project_dir/scripts/install-hamio.sh"
)
sh scripts/install-hamio.sh
.tools/bin/hamio --version
.tools/bin/hamio capabilities
```

`.hamio-version` と `scripts/install-hamio.sh` は利用側の Git で管理する。インストーラーを更新する場合も、対象リリースから取得・検証して差分をレビューする。

### 配置と失敗時の動作

インストーラーは次の順序で処理する。

1. OS・CPU と版指定を検証し、配置先ごとの lock を取得する。
2. immutable release を検証し、タグのソース commit を解決する。
3. gzip、checksum、SBOM、notices を一時領域へ取得し、各資産の由来を検証する。
4. gzip の SHA-256 を確認し、容量制限付きで展開する。
5. 展開後の SHA-256 と `--version` を確認する。
6. `.tools/lib/hamio/<版>-<対象>/` へ保存し、最後に `.tools/bin/hamio` の symlink を切り替える。

検証失敗時は使用中の symlink を切り替えない。同じ版の保存先に異なるバイト列がある場合、管理対象外の実行ファイルがある場合、別のインストーラーが lock を保持する場合も停止する。

SIGKILL や電源断で lock が残った場合は、実行中のインストーラーがないことを確認して `.tools/.hamio-install.lock` を削除する。

| 指定                 | 動作                                        |
| -------------------- | ------------------------------------------- |
| 指定なし             | `.hamio-version` の版を `.tools` へ配置する |
| `--version vX.Y.Z`   | pin ファイルより優先する完全な版指定        |
| `--prefix DIRECTORY` | 配置先を変更する                            |

通常運用はプロジェクトごとの pin と `.tools` を使う。明示的な版指定は一時的な検証にも使える。ユーザー共通の配置が必要なら `--prefix "$HOME/.local"` を指定する。

## スクリプトから呼び出す

[フォーム定義の例](../examples/form.json)を利用側の `scripts/form.json` へ保存すると、次の Shell で非対話の回答を受け取れる。

```sh
response=$(
  printf '%s\n' '{"environment":"local","approved":false}' |
    .tools/bin/hamio form --definition scripts/form.json \
      --values - --interactive never
)
printf '%s\n' "$response"
```

対話では stdin を端末に接続し、提供値がある場合は `--values` にファイルを指定する。UI は stderr、回答は stdout へ分離される。利用側は回答と終了コードを確認して業務処理を進める。[Shell](../examples/form.sh)と[Python](../examples/form.py)の例、[API 契約](api.md)を参照する。

## GitHub Actions で使う

[composite action](../action.yml)は同じインストーラーを呼び、`PATH` と `binary` output を設定する。製品の版を `.hamio-version`、インストーラーを含む action の版を `uses` の完全な commit SHA で固定する。

```yaml
permissions:
  contents: read

jobs:
  scripts:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
        with:
          persist-credentials: false
      # <...> を action.yml を含むレビュー済みの完全な commit SHA に置換する。
      - uses: 9uiLe/hamio@<REVIEWED_40_CHARACTER_COMMIT_SHA>
        id: hamio
      - run: hamio capabilities
```

`with.version` は pin ファイルを上書きする完全な版指定、`with.token` は読み取り用 GitHub token とする。token の既定値は `github.token`。対応する GitHub-hosted runner を使う。キャッシュを理由に検証を省略しない。

## 更新・ロールバック・削除

更新時は対象版のリリースノート、API、対応環境、Bun・依存の変更を確認する。`.hamio-version` を変更して `sh scripts/install-hamio.sh` を実行し、利用側のフォーム、表示、失敗処理を検査してから pin の変更をマージする。

ロールバックも pin を対象の公開版へ戻して同じインストーラーを実行する。保存済みの版を選ぶ場合も公開資産を取得・検証するため通信が必要である。脆弱性のある版を採用するかどうかは利用側が判断する。

古い配置物は使用中の symlink と実行中のプロセスが参照していないことを確認して削除する。hamio 全体の削除対象は `.tools/bin/hamio` と `.tools/lib/hamio/` とし、他のツールと共有する prefix 全体を削除しない。

## 手元でビルドした実行ファイル

レビューしたソースを hamio の clone 内でビルドし、同じ OS・CPU の利用側へコピーできる。`consumer_dir` は実在する利用側リポジトリへ置き換える。

```sh
./scripts/dev.sh bun run setup
./scripts/dev.sh bun run build
consumer_dir=/absolute/path/to/consumer
mkdir -p "$consumer_dir/.tools/local-hamio"
cp dist/hamio "$consumer_dir/.tools/local-hamio/hamio"
"$consumer_dir/.tools/local-hamio/hamio" capabilities
```

コピー後の実行に Bun・Node.js・Nix は不要である。ローカルビルドには GitHub の公開資産の証明は付かないため、ソースとビルド環境を自分で確認する。公開版のインストーラーが管理する `.tools/bin/hamio` とは配置先を分ける。

## 保守者のリリース工程

### 梱包と公開前の確認

`./scripts/dev.sh bun run release:package` はホスト向けの実行ファイルと、`dist/release/` の gzip、checksum、SBOM、notices を生成する。macOS の梱包は共通インストーラーも生成する。ローカルの梱包コマンドは公開や証明発行を行わない。

リリースは次の順序で進める。

1. 変更と `package.json` の版を PR でレビューし、format、check、必要な preview を通して `master` へマージする。
2. 本体の `LICENSE` と package の `license`、同梱部品の配布条件を確認する。Bun 更新時は `scripts/release/metadata.ts` の版・revision と notices も更新する。
3. Bun と native 依存の security advisory・変更履歴を確認する。JavaScript の既知脆弱性は workflow の `bun audit` でも検査する。
4. 対象版の `master` commit に `vX.Y.Z` タグを作り、push する。
5. [Release workflow](../.github/workflows/release.yml)の全 job と、公開された実物の導入結果を確認する。

```sh
# X.Y.Z は package.json と一致させ、<...> は対象 commit に置換する。
git tag -a vX.Y.Z -m 'hamio vX.Y.Z' <REVIEWED_MASTER_COMMIT>
git push origin refs/tags/vX.Y.Z
```

公開前検査は、公開元・タグ・package の版、`master` への commit の包含、clean worktree、LICENSE とライセンス識別子を確認する。条件を満たさなければ失敗する。通常の branch push・マージは Release の起動対象に含めない。所有者は版タグを選んで `workflow_dispatch` から実行することもできる。

### 権限と公開順序

| job              | 処理                                                              | 権限                                                                                   |
| ---------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `build`          | 3対象で固定依存の取得、公開前検査、audit、check、梱包             | `contents: read`                                                                       |
| `attest`         | ビルド済み資産の provenance と、gzip に結び付く SBOM の証明を発行 | `contents: read`、`id-token: write`、`attestations: write`、`artifact-metadata: write` |
| `publish`        | 全資産を draft に添付して公開し、immutable release を確認         | `contents: write`                                                                      |
| `verify-install` | 3対象で公開資産を検証・導入し、capabilities を実行                | `contents: read`                                                                       |

証明発行と公開の job は製品コードを実行しない。Actions は完全な commit SHA で固定する。日常の PR 検査は Linux 1ジョブとし、配布対象別のビルド・公開・導入試験は Release workflow が担当する。

immutable releases をリポジトリ設定で有効にし、公開前にも確認する。公開済みタグと資産は差し替えない。公開途中で draft が残った場合は内容を調査し、不要な draft だけを削除して再実行する。

公開後の導入試験が失敗した場合は影響環境を告知し、原因に応じて修正版を発行する。同梱 Bun の修正も hamio の製品版を更新して配布する。取得先や証明サービスの障害時も検証を省略しない。

## 検証の範囲

[distribution.test.ts](../tests/distribution.test.ts) は GitHub CLI の代替実装を使い、信頼条件の引数、検証失敗時の非実行、更新・ロールバック、lock、既存ファイルの保護を試験する。[executable.test.ts](../tests/executable.test.ts) は本物の実行ファイルを Bun のない PATH と別ディレクトリで動かす。

GitHub の署名と公開資産の結び付きは Release workflow の公開後の導入試験で確認する。ローカルの代替実装による試験は検証方針と失敗処理の評価であり、署名検証や他の OS での実行結果はそれぞれ実施して記録する。

## 根拠

- [Immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases): 公開済みタグ・資産の固定と release attestation。
- [GitHub CLI attestation verify](https://cli.github.com/manual/gh_attestation_verify): repository、workflow、source ref / digest、runner の信頼条件。
- [GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners): runner の OS・CPU。
- [actions/attest](https://github.com/actions/attest/tree/1e69f48acb82d1966a394da916b4c1698aa569d6): provenance と SBOM の証明発行。
- [SPDX 2.3](https://spdx.github.io/spdx-spec/v2.3/): 在庫の交換形式と `NOASSERTION`。
