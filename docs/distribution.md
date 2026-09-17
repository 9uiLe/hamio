# hamio 導入・更新・リリース

hamio は、製品コード・製品依存・Bun をまとめた実行ファイルを GitHub Releases で配布する。利用側は公開版を明示して導入し、スクリプトからその実行ファイルを直接呼び出す。通常実行には Bun・Node.js・Nix を必要としない。業務処理に使う言語ランタイムは利用側が用意する。

本書の前半は利用者による取得・配置・更新、[保守者のリリース工程](#保守者のリリース工程)以降は生成・検証・公開を定める。入力形式は [API 契約](api.md)、ビルド内部の責務は[実装設計](implementation.md#9-ビルドと配布の境界)、特定 commit の検証結果と公開状況は[リリース評価](release-readiness.md)を参照する。

## 配布方式と対象環境

| 対象識別子     | ビルド・実行試験の環境      |
| -------------- | --------------------------- |
| `darwin-arm64` | macOS 15、Apple Silicon     |
| `linux-x64`    | Ubuntu 24.04、x86_64、glibc |
| `linux-arm64`  | Ubuntu 24.04、ARM64、glibc  |

対象ごとの native runner で CLI、疑似端末（PTY）、梱包した実行ファイル、配布候補、公開物の導入を試験し、確認した環境をリリースノートに記載する。古い OS、Intel Mac、Windows、musl、すべての端末は保証対象に含めない。x64 の Bun は SSE4.2 以上を要求する。[Bun の CPU 要件](https://bun.com/docs/installation#cpu-requirements)

製品版は `package.json` の `version` を実行ファイルに埋め込み、同じ版の `vX.Y.Z` タグで公開する。導入時は完全な版を指定する。`latest`、範囲指定、暗黙の更新は扱わない。入出力の契約版 `apiVersion` は製品版と独立して管理する。

## 配布物と在庫情報

公開リリースに添付するファイルを資産、公開前の検証対象となる資産一式を配布候補と呼ぶ。

| 資産名                            | 内容                                                               |
| --------------------------------- | ------------------------------------------------------------------ |
| `hamio-vX.Y.Z-<対象>.gz`          | 単一実行ファイルの gzip                                            |
| `hamio-vX.Y.Z-<対象>.sha256`      | gzip と展開後の `hamio` の SHA-256                                 |
| `hamio-vX.Y.Z-<対象>.spdx.json`   | SPDX 2.3 形式の同梱部品の在庫                                      |
| `hamio-vX.Y.Z-<対象>.notices.txt` | 本体・npm の許諾全文、Bun の notices、ソース・再リンク手順への参照 |
| `install.sh`                      | 全対象共通の POSIX インストーラー。macOS の梱包工程で生成          |

SBOM（Software Bill of Materials）は同梱部品の在庫情報である。hamio 本体、解決した production npm 依存、同梱 Bun を記録する。ソース commit、作業ツリーの変更有無、ビルド入力の内容 hash、lockfile・実行ファイル・gzip・ランタイムの hash、npm の版と取得元を含め、日時は commit 時刻から決める。開発ツールは製品依存に含めない。

hamio 本体は [MIT License](../LICENSE)、著作権表記は `Copyright (c) 2026 9uiLe` とする。package の `license` と SBOM の `licenseDeclared` を `MIT` とし、notices に全文を含める。第三者のコードには各部品のライセンスが適用される。

Bun は native ライブラリと polyfill を集約した一つの部品として記録する。内部の個別の版・許諾を網羅的に確定した SBOM ではなく、未確認の項目には `NOASSERTION` を使う。SBOM の署名は在庫の網羅性や脆弱性の不存在を保証しない。

Bun には MIT の本体、LGPL の JavaScriptCore、他の native ライブラリが含まれる。再リンク用 Bun は[固定した提供元の notices](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/LICENSE.md)の手順で用意する。hamio の同じタグのソースと固定依存を取得し、`HAMIO_BUN_RUNTIME` にその Bun を指定して `bun scripts/build.ts` を実行できる。独自ビルドは公式資産の hash・証明の対象外とする。公開者は各部品の許諾・通知・ソース提供条件を確認する。

## 導入時の前提と信頼条件

取得・更新には GitHub への通信、GitHub CLI、POSIX shell、gzip、`sha256sum` または `shasum` が必要である。GitHub CLI は2.100.0で動作確認しており、`release verify`、`release verify-asset`、`attestation verify --source-digest` を使う。[公式の導入経路](https://cli.github.com/)で用意し、認証済み CLI または読み取り用 `GH_TOKEN` を使う。

immutable release は公開後のタグと資産を固定する仕組み、provenance はソースとビルド工程の由来、attestation は情報に対する署名付き証明を指す。導入では次の条件をすべて検証する。

| 検証対象            | 必須条件                                                                            |
| ------------------- | ----------------------------------------------------------------------------------- |
| 公開元              | GitHub.com の `9uiLe/hamio`                                                         |
| リリース            | 指定タグの immutable release                                                        |
| release attestation | 取得した各資産が指定した公開リリースに属する                                        |
| provenance          | `.github/workflows/release.yml`、指定タグと commit、GitHub-hosted runner に由来する |
| 完全性              | gzip と展開後の実行ファイルの SHA-256 が一致する                                    |
| 製品版              | 実行ファイルの `--version` が指定版と一致する                                       |

検証に使う GitHub CLI と、信頼する公開元・workflow を導入の起点とする。インストーラー自身も実行前に検証する。配置先は信頼するユーザーだけが書き込めるディレクトリにし、root 権限を必要としない構成にする。通常起動では通信、版照会、補助プロセス、ランタイム取得を行わない。

## リポジトリへの導入

[リリース一覧](https://github.com/9uiLe/hamio/releases)から採用する版を選ぶ。以下の `v0.1.0` は書式例であり、公開を示すものではない。利用する公開版に置き換え、利用側リポジトリの直下で実行する。公開版がない場合は[ローカルビルド](#手元でビルドした実行ファイル)を使う。

```sh
printf '%s\n' v0.1.0 > .hamio-version
printf '%s\n' '.tools/' >> .gitignore
```

指定版のインストーラーを一時ディレクトリへ取得し、公開資産との結び付き、workflow、タグ、commit を検証してから利用側へ保存する。

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

`.hamio-version` と `scripts/install-hamio.sh` を利用側の Git で管理する。インストーラー自身の更新でも、対象版からの取得・検証と差分のレビューを行う。

### 配置と失敗時の動作

インストーラーは取得した実行ファイルを検証してから、使用中の版を切り替える。

1. OS・CPU・版指定を検証し、配置先の lock を取得する。
2. immutable release を確認し、タグのソース commit を解決する。
3. gzip、checksum、SBOM、notices を一時領域へ取得し、各資産の公開リリースとの結び付きと由来を検証する。
4. gzip の hash を確認し、容量制限付きで展開する。
5. 展開後の hash と `--version` を照合する。
6. `.tools/lib/hamio/<版>-<対象>/` へ保存し、最後に `.tools/bin/hamio` の symlink を切り替える。

検証に失敗した場合は使用中の symlink を変更しない。同じ版の保存先に異なるバイト列がある場合、管理対象外の実行ファイルがある場合、別の導入処理が lock を保持する場合も停止する。

SIGKILL や電源断で lock が残った場合は、導入処理が動いていないことを確認して `.tools/.hamio-install.lock` を削除する。

| オプション           | 動作                                    |
| -------------------- | --------------------------------------- |
| 指定なし             | `.hamio-version` の版を `.tools` へ配置 |
| `--version vX.Y.Z`   | pin ファイルより優先する完全な版指定    |
| `--prefix DIRECTORY` | 配置先を指定                            |

通常運用ではプロジェクトごとの pin と `.tools` を使う。一時的な検証には `--version`、ユーザー共通の配置には `--prefix "$HOME/.local"` を指定できる。

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

対話には stdin の端末接続を使う。対話と提供値を併用する場合は `--values` にファイルを指定する。UI は stderr、回答は stdout に分離される。利用側は回答と終了コードを確認して業務を進める。言語からの接続例は [Shell](../examples/form.sh)・[Python](../examples/form.py)、不足・無効値・中断の規則は [API 契約](api.md)を参照する。

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

`with.version` は pin より優先する完全な版指定、`with.token` は読み取り用 token で、既定は `github.token` とする。対応する GitHub-hosted runner を使う。キャッシュの有無によらず公開資産の検証を行う。

## 更新・ロールバック・削除

更新する版のリリースノート、API、対応環境、Bun・依存の変更を確認する。`.hamio-version` を対象版へ変更してインストーラーを実行し、利用側のフォーム、表示、失敗処理を検査してから pin の変更をマージする。

ロールバックでは pin を対象の公開版へ戻し、同じインストーラーを実行する。保存済みの版でも公開資産の取得・検証に通信を使う。過去版の既知の脆弱性と回避策を確認して採用を判断する。

古い配置物は使用中の symlink と実行中プロセスが参照していないことを確認して削除する。hamio 全体の削除対象は `.tools/bin/hamio` と `.tools/lib/hamio/` とする。他のツールと共有する prefix 全体を削除しない。

## 手元でビルドした実行ファイル

レビューしたソースを hamio の clone でビルドし、同じ OS・CPU の利用側へ配置する。次の `consumer_dir` は実在する利用側リポジトリに置き換える。

```sh
./scripts/dev.sh bun run setup
./scripts/dev.sh bun run build
consumer_dir=/absolute/path/to/consumer
mkdir -p "$consumer_dir/.tools/local-hamio"
cp dist/hamio "$consumer_dir/.tools/local-hamio/hamio"
"$consumer_dir/.tools/local-hamio/hamio" capabilities
```

配置後の実行に Bun・Node.js・Nix は不要である。ローカルビルドには公開資産の証明が付かないため、ソースとビルド環境を確認して使う。公開版インストーラーの管理領域と分けて `.tools/local-hamio/` に配置する。

## 保守者のリリース工程

公開は、配布候補の生成、再現性と動作の検証、署名付き証明の検証、所有者の承認、immutable release の公開、公開物の導入試験の順で行う。候補の検証は公開前に実施でき、公開資産との結び付きは公開後に確認する。

### 配布候補の生成と検証

`./scripts/dev.sh bun run release:package` はソースの内容・commit・時刻・ランタイムを特定し、専用領域で固定依存の取得、ビルド、梱包を行う。ホスト向けの資産を `dist/release/` に保存する。

公開条件の確認には `./scripts/dev.sh bun run release:verify` を使う。

1. 同じ入力を異なる二つのディレクトリへ複製し、それぞれ固定依存を取得する。
2. 二候補を順次ビルド・梱包し、全資産の名前と SHA-256 を比較する。
3. 一つ目の gzip を展開し、実行ファイルの hash を照合する。
4. 展開した実行ファイルを再ビルドせず API・端末試験に渡す。
5. 入力の不変を再確認し、合格した資産と `dist/release-verification.json` を保存する。

日時を含む SBOM も比較対象とする。比較する条件は同じソース・依存・ランタイム・対象環境とし、異なる OS・CPU の資産同士の一致は求めない。既存の `dist/hamio` は候補生成に使わない。生成中の入力・ランタイム変更は失敗として扱う。

保存時は出力先を lock し、資産ディレクトリ一式を入れ替える。古い資産は退避し、配置失敗時に復元する。復元できない場合は退避先を残してエラーで知らせる。SIGKILL などで `dist/release.lock` が残った場合は、生成処理が動いていないことと退避資産を確認して復旧する。ローカルでの生成・検証は公開や証明発行を行わない。

### 候補の検証と公開の操作

Release workflow は所有者の手動実行だけを受け付ける。既定の `mode=verify` ではブランチまたは版タグを検証し、タグや GitHub Release を作成しない。署名付き証明は実際に発行・検証するため、候補の workflow 実行と provenance は公開リポジトリ上に残る。

```sh
# REVIEW_BRANCH をレビューするブランチへ置き換える。
gh workflow run release.yml --ref REVIEW_BRANCH -f mode=verify
```

3対象の check、audit、独立した二回の梱包、展開後の API・端末試験を通し、全資産の provenance と gzip に対応する SBOM の証明を発行する。別 job の新しい native runner が provenance の repository・workflow・source ref・commit を照合し、gzip と展開後の hash を確認する。独立した Git プロジェクトで開発ランタイムのない PATH と限定した環境変数を使い、実行ファイルの版、機能照会、非対話フォームを試験する。

Actions の `verification-<対象>` artifact には commit、入力・資産の hash、対象、ランタイム、サイズを30日間保存する。候補資産の保持は7日間とする。公開判断に必要な記録は[リリース評価](release-readiness.md)とその根拠データへ保存する。

正式公開は次の手順で行う。

1. 変更と `package.json` の版を PR でレビューし、`quality` と候補検証を通して `master` へマージする。
2. 本体・同梱部品の許諾、Bun・native 依存の advisory、対応環境、性能の実測範囲を確認する。確認先、固定 revision、結果をリリース評価へ記録する。
3. レビュー済みの `master` commit に `vX.Y.Z` タグを作成して push する。タグは作成後に更新・削除できないため、対象 commit と版を事前に照合する。タグ push では workflow は起動しない。
4. そのタグに `mode=publish` を明示して Release workflow を実行する。タグのソースで候補の全検証を実施する。
5. 所有者が immutable releases の有効化を確認し、`release` Environment の承認画面で対象 commit、3環境の検証結果、許諾・advisory の記録を照合して公開を承認する。
6. 公開後の3環境での取得・immutable release 検証・導入、利用側 Action、非対話フォームの試験結果を確認する。

```sh
# X.Y.Z は package.json の版、<...> はレビュー済みの対象 commit に置換する。
git tag -a vX.Y.Z -m 'hamio vX.Y.Z' <REVIEWED_MASTER_COMMIT>
git push origin refs/tags/vX.Y.Z
gh workflow run release.yml --ref vX.Y.Z -f mode=publish
```

preflight は公開元、明示した実行モード、clean worktree、LICENSE とライセンス識別子を確認する。公開モードでは完全な版タグと package の一致、`master` への包含も必須とする。`vX.Y.Z-rc.N` などの接尾辞は受け付けない。

### 公開物の導入試験

公開後の `verify-install` は自動で実行する。既存の公開版を再検証する場合は、所有者が完全な版を指定する。

```sh
gh workflow run release.yml --ref master -f mode=verify-install -f version=vX.Y.Z
```

このモードはビルド、証明発行、公開を行わず、3対象の導入試験だけを実行する。指定版の immutable release を検証し、そのタグの commit へ固定したインストーラーと利用側 Action を使う。検証 workflow の ref と、検証する製品のタグ・commit は別に記録する。

### 権限と公開順序

| job                | 工程                                                                 | 権限                                                                                   |
| ------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `build`            | 3対象の preflight、audit、check、二回の生成・比較、展開後の試験      | `contents: read`                                                                       |
| `attest`           | 全資産の provenance と gzip に結び付く SBOM の証明                   | `contents: read`、`id-token: write`、`attestations: write`、`artifact-metadata: write` |
| `verify-candidate` | 実際の provenance、圧縮前後の hash、独立プロジェクトからの実行       | `contents: read`                                                                       |
| `publish`          | 公開モード・版タグ・Environment 承認を条件に draft 作成・公開        | `contents: write`                                                                      |
| `verify-install`   | 3対象で公開物の検証・導入、利用側 Action、独立プロジェクトからの実行 | `contents: read`                                                                       |

証明発行・公開の job は製品コードを実行しない。製品の smoke test には token を渡さない。Actions は完全な commit SHA で固定する。PR の共通検査は Linux 1ジョブとし、3環境の配布検証は手動の Release workflow が担当する。

`release` Environment の承認者は所有者のみ、対象は `v*` タグのみとし、管理者による承認の bypass を無効にする。単独保守のため起動者自身による承認を許可する。設定値と保護対象は[開発手順](development.md#リポジトリの保護設定)に定める。

immutable releases の設定照会には repository の `Administration: read` が必要であり、標準の `GITHUB_TOKEN` では取得できない。所有者は Environment の承認前に次を実行し、結果が `true` でなければ公開しない。[設定照会 API](https://docs.github.com/en/rest/repos/repos#check-if-immutable-releases-are-enabled-for-a-repository)

```sh
gh api repos/9uiLe/hamio/immutable-releases --jq .enabled
```

workflow は `contents: write` で全資産を draft に添付してから公開し、`gh release verify` で実際の immutable release を検証する。同じ版のリリースが存在する場合は停止する。draft が残っている場合は内容を調査し、不要な draft だけを削除して再実行する。公開済みタグ・資産は差し替えない。

公開前の候補検証では immutable release と資産の結び付きを検証できない。公開後の導入試験が失敗した場合は、影響環境をリリースノートへ記載し、その版の推奨を止め、修正版を新しい版で発行する。取得先や証明サービスの障害でも検証を省略しない。影響調査と修正は[セキュリティ方針](../SECURITY.md)に従う。

## 検証の範囲

| 入口                                                  | 確認するもの                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [distribution.test.ts](../tests/distribution.test.ts) | GitHub CLI の代替実装による検証条件、失敗時の非実行、更新・復旧、lock、既存ファイル保護 |
| [executable.test.ts](../tests/executable.test.ts)     | 本物の実行ファイルを使う Bun のない PATH、別ディレクトリ、暗黙設定、端末入力            |
| [release.test.ts](../tests/release.test.ts)           | 独立ルートのビルド、入力の固定、資産配置と失敗時の復元                                  |
| `release:verify`                                      | 独立した二候補の全資産と、梱包した実行ファイルの API・端末動作                          |
| `verify-candidate`                                    | 実際の provenance、展開後の hash、独立した Git プロジェクトでの機能照会・フォーム       |
| 公開後の導入試験                                      | 実際の GitHub 署名、公開資産との結び付き、対象環境への配置と起動                        |

各試験は対象と検証経路を明示して結果を記録する。代替実装による試験は実際の署名検証の成功を示さない。同一環境での二候補の一致は、別ホストでの一致や依存の無害性を証明するものではない。

## 根拠

- [Immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases): 公開済みタグ・資産の固定と release attestation。
- [GitHub CLI attestation verify](https://cli.github.com/manual/gh_attestation_verify): repository、workflow、source ref / digest、runner の信頼条件。
- [GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners): runner の OS・CPU。
- [actions/attest](https://github.com/actions/attest/tree/1e69f48acb82d1966a394da916b4c1698aa569d6): provenance と SBOM の証明発行。
- [SPDX 2.3](https://spdx.github.io/spdx-spec/v2.3/): 在庫の交換形式と `NOASSERTION`。
- [SOURCE_DATE_EPOCH](https://reproducible-builds.org/docs/source-date-epoch/): ソースの時刻を使った再現可能な生成物。
