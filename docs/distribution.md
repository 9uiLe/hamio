# hamio 導入・更新・リリース

hamio は、本体・製品依存・Bun をまとめた実行ファイルを GitHub Releases で配布する。利用側は完全な版を指定し、検証済みの実行ファイルをプロジェクトへ配置する。通常実行に Bun・Node.js・Nix は不要である。業務処理の言語ランタイムは利用側が用意する。

本書は、利用者による取得・配置・更新と、保守者による配布候補の生成・検証・公開を定める。公開状況は [README](../README.md)、入出力は [API 契約](api.md)、内部の処理境界は[実装設計](implementation.md#9-ビルドと配布の境界)を参照する。

## 配布方式と対象環境

| 対象識別子     | ビルド・実行試験の環境      |
| -------------- | --------------------------- |
| `darwin-arm64` | macOS 15、Apple Silicon     |
| `linux-x64`    | Ubuntu 24.04、x86_64、glibc |
| `linux-arm64`  | Ubuntu 24.04、ARM64、glibc  |

各対象の native runner で CLI、PTY、同梱実行ファイル、配布候補、公開物の導入を試験する。確認した環境をリリースノートへ記載する。古い OS、Intel Mac、Windows、musl、すべての端末を保証対象には含めない。x64 の Bun は SSE4.2 以上を要求する。[Bun の CPU 要件](https://bun.com/docs/installation#cpu-requirements)

製品版は `package.json` の `version` を実行ファイルに埋め込み、同じ版の `vX.Y.Z` タグで公開する。インストーラーは完全な版だけを受け付ける。`latest`、範囲指定、暗黙の更新は扱わない。公開データの `apiVersion` は製品版とは独立した契約版である。

## 配布物と在庫情報

| 資産名                            | 内容                                                               |
| --------------------------------- | ------------------------------------------------------------------ |
| `hamio-vX.Y.Z-<対象>.gz`          | 単一実行ファイルの gzip                                            |
| `hamio-vX.Y.Z-<対象>.sha256`      | gzip と展開後の `hamio` の SHA-256                                 |
| `hamio-vX.Y.Z-<対象>.spdx.json`   | SPDX 2.3 形式の同梱部品の在庫                                      |
| `hamio-vX.Y.Z-<対象>.notices.txt` | 本体・npm の許諾全文、Bun の notices、ソース・再リンク手順への参照 |
| `install.sh`                      | 全対象共通の POSIX インストーラー。macOS の梱包で生成              |

SBOM（Software Bill of Materials）は同梱部品の在庫情報である。本体、解決した production npm 依存、同梱 Bun を記録し、開発ツールを製品依存へ含めない。ソース commit、作業ツリーの変更有無、ビルド入力の内容 hash、lockfile・実行ファイル・gzip・ランタイムの hash、npm の版と取得元を含める。日時は commit 時刻から決める。

hamio 本体は [MIT License](../LICENSE)、著作権表記は `Copyright (c) 2026 9uiLe`。package の `license` と SBOM の `licenseDeclared` を `MIT` とし、notices に全文を含める。第三者のコードには各部品のライセンスが適用される。

Bun は native ライブラリと polyfill を含む一つの部品として在庫に記録する。内部の個別の版・許諾を網羅的に確定した SBOM ではなく、未確認の項目には `NOASSERTION` を使う。証明の署名も在庫の網羅性や脆弱性の不存在を保証しない。

Bun は MIT の本体、LGPL の JavaScriptCore、他の native ライブラリを含む。[固定した提供元の notices](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/LICENSE.md)に従って再リンク用 Bun を用意できる。hamio の同じタグのソースと固定依存を取得し、`HAMIO_BUN_RUNTIME` にその Bun を指定して `bun scripts/build.ts` を実行する。独自ビルドは公式資産の hash・証明の対象外となる。公開者は各部品の許諾・通知・ソース提供条件を確認する。

## 導入時の前提と信頼条件

取得・更新には GitHub への通信、GitHub CLI、POSIX shell、gzip、`sha256sum` または `shasum` が必要である。GitHub CLI は2.100.0で動作確認しており、`release verify`、`release verify-asset`、`attestation verify --source-digest` を使う。[公式の導入経路](https://cli.github.com/)で用意し、認証済み CLI または読み取り用 `GH_TOKEN` を使う。

| 検証する対象        | 必須条件                                                                            |
| ------------------- | ----------------------------------------------------------------------------------- |
| 公開元              | GitHub.com の `9uiLe/hamio`                                                         |
| リリース            | 指定タグの immutable release。公開済みのタグ・資産が固定されている                  |
| release attestation | 取得した各資産が指定した公開リリースに属する                                        |
| provenance          | `.github/workflows/release.yml`、指定タグと commit、GitHub-hosted runner に由来する |
| 完全性              | gzip と展開後の実行ファイルの SHA-256 が一致する                                    |
| 製品版              | 実行ファイルの `--version` が指定版と一致する                                       |

provenance はソースとビルド工程の由来を表す。attestation はその情報に対する署名付き証明である。検証に使う GitHub CLI と、信頼する公開元・workflow を導入の起点とする。インストーラーも実行前に検証する。

配置先は信頼するユーザーだけが書き込めるディレクトリにする。root 権限は不要である。導入後は実行ファイルへの symlink を直接呼び出し、通常起動で通信、版照会、補助プロセス、ランタイム取得を行わない。

## リポジトリへの導入

[リリース一覧](https://github.com/9uiLe/hamio/releases)から採用する版を選ぶ。以下の `v0.1.0` は書式例であり、公開を示すものではない。利用する公開版に置き換えて、利用側リポジトリの直下で実行する。公開版がない場合は[ローカルビルド](#手元でビルドした実行ファイル)を使う。

```sh
printf '%s\n' v0.1.0 > .hamio-version
printf '%s\n' '.tools/' >> .gitignore
```

指定版のインストーラーを一時ディレクトリへ取得し、リリースとの結び付きと由来を検証してから利用側に保存する。

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

`.hamio-version` と `scripts/install-hamio.sh` を利用側の Git で管理する。インストーラー自体を更新する場合も、対象版から取得・検証し、差分をレビューする。

### 配置と失敗時の動作

インストーラーは次の順序で処理する。

1. OS・CPU・版指定を検証し、配置先の lock を取得する。
2. immutable release を確認し、タグのソース commit を解決する。
3. gzip、checksum、SBOM、notices を一時領域へ取得し、各資産の由来を検証する。
4. gzip の hash を確認し、容量制限付きで展開する。
5. 展開後の hash と `--version` を照合する。
6. `.tools/lib/hamio/<版>-<対象>/` へ保存し、最後に `.tools/bin/hamio` の symlink を切り替える。

検証失敗時は使用中の symlink を維持する。同じ版の保存先に異なるバイト列がある場合、管理対象外の実行ファイルがある場合、別の導入処理が lock を保持する場合も停止する。

SIGKILL や電源断で lock が残った場合は、導入処理が動いていないことを確認して `.tools/.hamio-install.lock` を削除する。

| オプション           | 動作                                    |
| -------------------- | --------------------------------------- |
| 指定なし             | `.hamio-version` の版を `.tools` へ配置 |
| `--version vX.Y.Z`   | pin ファイルより優先する完全な版指定    |
| `--prefix DIRECTORY` | 配置先を指定                            |

通常運用はプロジェクトごとの pin と `.tools` を使う。明示的な版指定は一時的な検証にも使える。ユーザー共通の配置には `--prefix "$HOME/.local"` を指定する。

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

対話には stdin の端末接続を使い、提供値がある場合は `--values` にファイルを指定する。UI は stderr、回答は stdout へ分離される。利用側は回答と終了コードを確認して業務を進める。[Shell](../examples/form.sh)・[Python](../examples/form.py)の例と [API 契約](api.md)に接続方法を示す。

## GitHub Actions で使う

[composite action](../action.yml)は同じインストーラーを実行し、`PATH` と `binary` output を設定する。製品版は `.hamio-version`、action とインストーラーは `uses` の完全な commit SHA で固定する。

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

`with.version` は pin より優先する完全な版指定、`with.token` は読み取り用 token で、既定は `github.token` とする。対応する GitHub-hosted runner を使い、キャッシュを理由に検証を省略しない。

## 更新・ロールバック・削除

更新ではリリースノート、API、対応環境、Bun・依存の変更を確認する。`.hamio-version` を対象版へ変更してインストーラーを実行し、利用側のフォーム、表示、失敗処理を検査してから pin の変更をマージする。

ロールバックは pin を対象の公開版へ戻し、同じインストーラーを実行する。保存済みの版でも公開資産の取得・検証に通信を使う。脆弱性のある版を採用するかは利用側が判断する。

古い配置物は使用中の symlink と実行中プロセスが参照していないことを確認して削除する。hamio 全体の削除対象は `.tools/bin/hamio` と `.tools/lib/hamio/`。他のツールと共有する prefix 全体を削除しない。

## 手元でビルドした実行ファイル

レビューしたソースを hamio の clone でビルドし、同じ OS・CPU の利用側へ配置できる。次の `consumer_dir` は実在する利用側リポジトリに置き換える。

```sh
./scripts/dev.sh bun run setup
./scripts/dev.sh bun run build
consumer_dir=/absolute/path/to/consumer
mkdir -p "$consumer_dir/.tools/local-hamio"
cp dist/hamio "$consumer_dir/.tools/local-hamio/hamio"
"$consumer_dir/.tools/local-hamio/hamio" capabilities
```

配置後の実行に Bun・Node.js・Nix は不要である。ローカルビルドには公開資産の証明が付かないため、ソースとビルド環境を確認して使う。公開版インストーラーが管理する `.tools/bin/hamio` とは配置先を分ける。

## 保守者のリリース工程

### 配布候補の生成と検証

`./scripts/dev.sh bun run release:package` は、ソースの内容・commit・時刻・ランタイムを特定し、専用領域で固定依存の取得、ビルド、梱包を行う。ホスト向けの資産を `dist/release/` に保存する。

公開条件の確認には `./scripts/dev.sh bun run release:verify` を使う。

1. 同じ入力を異なる二つのディレクトリに複製し、それぞれ固定依存を取得する。
2. 二候補を順次ビルド・梱包し、全資産の名前と SHA-256 を比較する。
3. 一つ目の gzip を展開し、実行ファイルの hash を照合する。
4. 展開した実行ファイルを再ビルドせず API・端末試験へ渡す。
5. 入力の不変を再確認し、合格した資産と `dist/release-verification.json` を保存する。

日時を含む SBOM も比較対象とする。同じソース・依存・ランタイム・対象環境の再現性を検査し、異なる OS・CPU の実行ファイル同士の一致は求めない。候補は既存の `dist/hamio` を使わず、生成中の入力・ランタイムの変更を検出すると失敗する。

保存は出力先の lock を取得して資産ディレクトリ一式を入れ替える。古い資産を退避し、配置失敗時は復元する。復元できない場合は退避先を残してエラーで知らせる。SIGKILL などで `dist/release.lock` が残った場合は、生成処理が動いていないことと退避資産を確認して復旧する。ローカルでの生成・検証は公開と証明発行を行わない。

### 候補の検証と公開の操作

Release workflow は所有者の手動実行だけを受け付ける。既定の `mode=verify` はブランチまたは版タグを検証し、GitHub Releases への公開は行わない。証明は実際に発行・検証するため、候補の workflow 実行と provenance は公開リポジトリ上に残る。

```sh
# REVIEW_BRANCH をレビューするブランチへ置き換える。
gh workflow run release.yml --ref REVIEW_BRANCH -f mode=verify
```

3対象の check、audit、独立した二回の梱包、展開後の API・端末試験、provenance と SBOM の証明発行を行う。別 job の新しい native runner が証明の repository・workflow・source ref・commit を照合し、gzip と展開後の hash を確認する。独立した Git プロジェクトで開発ランタイムのない PATH と限定環境を使い、実行ファイルの版、機能照会、非対話フォームの回答を検査する。

Actions の `verification-<対象>` artifact に commit、入力・資産の hash、対象、ランタイム、サイズを30日間保存する。候補資産の保持は7日間。公開前に必要な記録をリポジトリの[リリース評価](release-readiness.md)へ残す。

正式公開は次の順序とする。

1. 変更と `package.json` の版を PR でレビューし、`quality` と候補検証を通して `master` へマージする。
2. 本体・同梱部品の許諾、Bun・native 依存の advisory、保証対象、性能の実測範囲を確認する。確認先・固定 revision・結果をリリース評価へ記録する。
3. レビュー済みの `master` commit に `vX.Y.Z` タグを作成して push する。タグは作成後に更新・削除できないため、対象 commit と版を先に照合する。タグ push では workflow は起動しない。
4. そのタグに対して `mode=publish` を明示して実行する。タグの正確なソースで候補の全検証を再実行する。
5. `release` Environment の承認画面で対象 commit、3環境の検証結果、許諾・advisory の記録を確認し、所有者が公開を承認する。
6. 公開後に3環境の実際の取得・immutable release 検証・導入、利用側 Action と非対話フォームの試験結果を確認する。

```sh
# X.Y.Z は package.json の版、<...> はレビュー済みの対象 commit に置換する。
git tag -a vX.Y.Z -m 'hamio vX.Y.Z' <REVIEWED_MASTER_COMMIT>
git push origin refs/tags/vX.Y.Z
gh workflow run release.yml --ref vX.Y.Z -f mode=publish
```

preflight は公開元、明示した実行モード、clean worktree、LICENSE とライセンス識別子を確認する。公開モードでは完全な版タグと package の一致、`master` への包含も必須とする。`vX.Y.Z-rc.N` などの接尾辞は受け付けない。

### 権限と公開順序

| job                | 担当する工程                                                         | 権限                                                                                   |
| ------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `build`            | 3対象の preflight、audit、check、二回の生成・比較、展開後の試験      | `contents: read`                                                                       |
| `attest`           | 全資産の provenance と gzip に結び付く SBOM の証明                   | `contents: read`、`id-token: write`、`attestations: write`、`artifact-metadata: write` |
| `verify-candidate` | 実際の provenance、圧縮前後の hash、独立プロジェクトからの実行       | `contents: read`                                                                       |
| `publish`          | 公開モード・版タグ・Environment 承認を条件に draft 作成・公開        | `contents: write`                                                                      |
| `verify-install`   | 3対象で公開物の検証・導入、利用側 Action、独立プロジェクトからの実行 | `contents: read`                                                                       |

証明発行・公開の job は製品コードを実行しない。製品の smoke test には token を渡さない。Actions は完全な commit SHA で固定する。PR の共通検査は Linux 1ジョブを維持し、3環境の配布検証は必要なときだけ実行する。

`release` Environment の承認者は所有者のみ、対象は `v*` タグのみとし、管理者による承認の bypass は無効にする。単独保守のため起動者自身による承認を許可する。リポジトリの保護設定は[開発手順](development.md#リポジトリの保護設定)を参照する。

immutable releases を有効にし、公開前にも確認する。全資産を draft に添付してから公開する。公開済みタグ・資産は差し替えない。draft が残った場合は内容を調査し、不要な draft だけを削除して再実行する。

公開前の候補検証では immutable release と資産の結び付きを検証できない。公開後の導入試験はその検証を担当する。失敗時は影響環境をリリースノートへ記載し、最新版としての推奨を止め、修正版を新しい版で発行する。取得先や証明サービスの障害時も検証を省略しない。詳細は[セキュリティ方針](../SECURITY.md)に従う。

## 検証の範囲

| 入口                                                  | 確認するもの                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [distribution.test.ts](../tests/distribution.test.ts) | GitHub CLI の代替実装による検証条件、失敗時の非実行、更新・復旧、lock、既存ファイル保護 |
| [executable.test.ts](../tests/executable.test.ts)     | 本物の実行ファイルを使う Bun のない PATH、別ディレクトリ、暗黙設定、端末入力            |
| [release.test.ts](../tests/release.test.ts)           | 独立ルートのビルド、入力の固定、資産配置と失敗時の復元                                  |
| `release:verify`                                      | 独立した二候補の全資産と、実際に梱包した実行ファイルの API・端末動作                    |
| `verify-candidate`                                    | 実際の provenance、展開後の hash、独立した Git プロジェクトでの機能照会・フォーム       |
| 公開後の導入試験                                      | 実際の GitHub 署名、公開資産との結び付き、対象環境への配置と起動                        |

代替実装による試験を実際の署名検証の結果とみなさない。各対象の実行結果を個別に記録する。再現性のローカル検査も、別ホストでの一致や依存の無害性を証明するものではない。

## 根拠

- [Immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases): 公開済みタグ・資産の固定と release attestation。
- [GitHub CLI attestation verify](https://cli.github.com/manual/gh_attestation_verify): repository、workflow、source ref / digest、runner の信頼条件。
- [GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners): runner の OS・CPU。
- [actions/attest](https://github.com/actions/attest/tree/1e69f48acb82d1966a394da916b4c1698aa569d6): provenance と SBOM の証明発行。
- [SPDX 2.3](https://spdx.github.io/spdx-spec/v2.3/): 在庫の交換形式と `NOASSERTION`。
- [SOURCE_DATE_EPOCH](https://reproducible-builds.org/docs/source-date-epoch/): ソースの時刻を使った再現可能な生成物。
