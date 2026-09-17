# hamio 導入・更新・リリース

hamio は、製品コード・製品依存・Bun をまとめた実行ファイルを GitHub Releases で配布する。利用側は公開版を明示して導入し、スクリプトからその実行ファイルを直接呼び出す。通常実行には Bun・Node.js・Nix を必要としない。業務処理に使う言語ランタイムは利用側が用意する。

利用者は[リポジトリへの導入](#リポジトリへの導入)、[GitHub Actions](#github-actions-で使う)、[更新とロールバック](#更新ロールバック削除)の手順に従う。保守者は[リリース工程](#保守者のリリース工程)に従い、配布候補、承認付き公開、公開版の導入試験を管理する。入力形式は [API 契約](api.md)、ビルド内部の責務は[実装設計](implementation.md#9-ビルドと配布の境界)、公開版の実施結果は[リリース評価](release-readiness.md)に定める。

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

[リリース一覧](https://github.com/9uiLe/hamio/releases)から採用する版を選び、対応環境と既知の制約を確認する。以下は公開版 [v0.1.0](https://github.com/9uiLe/hamio/releases/tag/v0.1.0) を導入する例である。別の版を採用する場合は完全なタグ名に置き換え、利用側リポジトリの直下で実行する。

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

配布は、固定入力からの候補生成、候補の証明と動作確認、所有者の公開承認、公開資産の導入試験で構成する。[Release workflow](../.github/workflows/release.yml) は `9uiLe/hamio` の所有者による `workflow_dispatch` だけを入口とし、タグ push では起動しない。

| mode             | 指定する対象                           | 実行する job                               | 完了時の状態                                       |
| ---------------- | -------------------------------------- | ------------------------------------------ | -------------------------------------------------- |
| `verify`（既定） | `--ref` のブランチまたはタグ           | build → attest → verify-candidate          | 候補と実際の証明を検証。タグ・Release は作成しない |
| `publish`        | `--ref` の完全な版タグ                 | 候補検証 → 承認 → publish → verify-install | 全資産を公開し、3対象で導入を確認                  |
| `verify-install` | workflow の `--ref` と製品の `version` | verify-install                             | 指定した公開版の導入だけを3対象で確認              |

workflow の ref は検証手順を選ぶ。製品のタグは検証する公開物を選ぶ。`publish` では同じタグを使い、`verify-install` では両者を独立して指定する。各結果には workflow と製品の commit をそれぞれ残す。

### 権限と公開順序

| 担当               | 責務                                                                | 必要な権限                                                                             |
| ------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 所有者             | 保護設定と immutable releases の確認、公開判断、Environment 承認    | リポジトリの管理権限                                                                   |
| `build`            | 3対象の preflight、audit、check、二回の生成・比較、展開後の試験     | `contents: read`                                                                       |
| `attest`           | 全資産の provenance と gzip に結び付く SBOM の証明発行              | `contents: read`、`id-token: write`、`attestations: write`、`artifact-metadata: write` |
| `verify-candidate` | 実際の provenance、圧縮前後の hash、独立プロジェクトでの実行        | `contents: read`                                                                       |
| `publish`          | 承認後の draft 作成、全資産の添付、公開、immutable release の検証   | `contents: write`                                                                      |
| `verify-install`   | 公開資産の取得・検証・導入、利用側 Action、独立プロジェクトでの実行 | `contents: read`                                                                       |

証明発行と公開の job は製品コードを実行しない。製品の smoke test へ token を渡さず、Actions は完全な commit SHA で固定する。PR の共通検査は Linux 1ジョブ、3環境の配布検証は手動の Release workflow が担当する。

`release` Environment は所有者の承認と `v*` タグを必須にし、管理者による承認の bypass を無効にする。単独保守のため起動者の自己承認は許可する。設定は[リポジトリの保護設定](development.md#リポジトリの保護設定)に従う。

immutable releases の設定照会には `Administration: read` が必要であり、標準の `GITHUB_TOKEN` では取得できない。所有者は管理権限のある認証で設定を確認し、公開 job は限定した権限で公開資産を操作する。[設定照会 API](https://docs.github.com/en/rest/repos/repos#check-if-immutable-releases-are-enabled-for-a-repository)

### 配布候補の生成と検証

ローカルでは固定 Nix 環境を使う。

```sh
./scripts/dev.sh bun run release:package
./scripts/dev.sh bun run release:verify
```

`release:package` は一候補を生成する。`release:verify` は次をすべて確認してから検証済み資産を保存する。

1. ソースの commit・内容と固定ランタイムを取得し、候補ごとの独立した作業ディレクトリを用意する。
2. 各ディレクトリで固定依存を取得し、同じ入力から順次ビルド・梱包する。
3. 二候補の全資産の名前と SHA-256 を照合する。SBOM と notices も比較対象に含める。
4. 一つ目の gzip を展開して hash を確認し、実行ファイルを再ビルドせず API・端末試験へ渡す。
5. 生成中に入力が変わっていないことを確認し、`dist/release/` と `dist/release-verification.json` を保存する。

比較条件は同じソース・依存・ランタイム・対象環境とする。SBOM の日時は commit 時刻から決め、異なる OS・CPU の資産同士の一致は求めない。共有の `dist/hamio` は候補生成に使わず、入力やランタイムが生成中に変われば失敗とする。

保存時は出力先を lock し、古い資産を退避してディレクトリ一式を入れ替える。配置失敗時は復元し、復元できない場合は退避先を残してエラーで知らせる。SIGKILL などで `dist/release.lock` が残った場合は、生成処理が動いていないことと退避資産を確認して復旧する。ローカルの配布コマンドは公開・証明発行を行わない。

### 候補の検証と公開の操作

候補のレビューには `mode=verify` を使う。`REVIEW_BRANCH` はレビュー対象のブランチに置き換える。

```sh
gh workflow run release.yml --ref REVIEW_BRANCH -f mode=verify
```

3対象の native runner で preflight、audit、check、二候補の一致、展開後の API・端末試験を確認する。全資産の provenance と gzip に対応する SBOM の証明を発行し、別 job の新しい runner が repository・workflow・source ref・commit・GitHub-hosted runner を照合する。gzip と展開後の hash も確認し、独立した Git プロジェクトで版・機能照会・非対話フォームを試験する。

`verify` の実行記録と証明は公開リポジトリ上に残る。Actions の候補資産は7日間、`verification-<対象>` artifact の検証記録は30日間保持する。長期保管が必要な commit、入力・資産 hash、対象、ランタイム、サイズ、実行結果は[リリース評価](release-readiness.md)と根拠データへ保存する。

正式公開は次の手順で行う。

1. 変更と `package.json` の版を PR でレビューし、`quality` と候補検証を通して `master` へマージする。
2. 同梱部品の許諾、Bun・native 依存の advisory、対応環境、性能の実測範囲を確認する。固定 revision、確認先、確認日、結果を記録する。
3. 対象 commit と版を照合し、レビュー済みの `master` commit に `vX.Y.Z` タグを作成して push する。タグは作成後に更新・削除できない。
4. タグを ref にして `mode=publish` を実行する。タグのソースで候補の全検証を行う。
5. 所有者の認証で immutable releases の有効化を確認する。Environment の承認画面で対象 commit、3環境の結果、許諾・advisory の記録を照合して承認する。
6. 全資産の公開と immutable release の検証、公開後の3環境の導入試験を確認し、製品タグ・commit と各工程の結果を保存する。

```sh
# X.Y.Z と <...> は package.json の版とレビュー済み master commit に置換する。
git tag -a vX.Y.Z -m 'hamio vX.Y.Z' <REVIEWED_MASTER_COMMIT>
git push origin refs/tags/vX.Y.Z
gh workflow run release.yml --ref vX.Y.Z -f mode=publish
```

preflight は公開元、明示したモード、clean worktree、LICENSE とライセンス識別子を確認する。公開では完全な版タグと package の一致、`master` への包含も必須とする。`vX.Y.Z-rc.N` などの接尾辞は受け付けない。

Environment の承認前に所有者が実行する設定確認は次のとおりである。結果が `true` でなければ公開しない。

```sh
gh api repos/9uiLe/hamio/immutable-releases --jq .enabled
```

公開 job は全資産を draft に添付してから公開し、`gh release verify` で実際の immutable release を検証する。同じ版の Release が存在する場合は draft を含めて停止する。

### 公開物の導入試験

`verify-install` job は `publish` 成功後に自動実行する。既存の公開版を調べる場合は `mode=verify-install` を使い、`version` に完全な `vX.Y.Z` を指定する。

```sh
# master の検証手順で、指定した公開製品版を検証する。
gh workflow run release.yml --ref master -f mode=verify-install -f version=vX.Y.Z
```

このモードでは build、attest、verify-candidate、publish を実行しない。3対象の runner は指定版の immutable release とタグの commit を取得し、`install.sh` の資産への帰属と由来を検証してから実行する。利用側 Action はその製品 commit から checkout する。

インストーラーと Action の両経路を確認し、独立した Git プロジェクトから限定した環境変数・開発ランタイムのない PATH で版、機能照会、非対話フォームを試験する。検証 workflow の ref・commit・実行 URL と、製品のタグ・commit・資産 digest を別に記録する。検証手順の変更によって、公開製品のバイト列や利用側 Action が置き換わることはない。

### 公開と導入の失敗

| 状態                         | 対応                                                                     |
| ---------------------------- | ------------------------------------------------------------------------ |
| 候補の生成・証明・検証が失敗 | 公開せず、対象 commit と失敗工程を調査する                               |
| 公開前の draft が残存        | 内容と添付資産を調査し、不要な draft だけを削除して再実行する            |
| 公開後の導入試験が失敗       | 影響環境をリリースノートへ記載し、その版の推奨を止め、新しい版で修正する |
| 取得先や証明サービスが停止   | 検証を省略せず停止する。利用側では使用中の版を保持する                   |

公開済みのタグ・資産は差し替えない。公開前の候補検証で確認できる由来と動作、公開後に確認する immutable release と資産の結び付きを区別する。影響調査、脆弱性の報告、修正版の提供は[セキュリティ方針](../SECURITY.md)に従う。

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
