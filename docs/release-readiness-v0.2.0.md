# hamio 0.2.0 配布候補の評価

本書は公開済み [v0.1.0 の評価](release-readiness.md)を変更せず、Presentation architecture を採用した **未公開**の 0.2.0 候補を評価する。製品の正本は [設計](design.md)、[Presentation API](presentation-api.md)、[Recording 形式](presentation-recording.md)、[Form 契約](interaction-form.md)。

## 版と公開判断

- Candidate product version: **0.2.0**。公開済み 0.1.0 から `render`、`stream`、root `capabilities` と v1 Presentation JSON を削除した破壊的変更である。0.1.1 patch では変更を表せない。まだ 1.0 の安定契約を約束していないため、次の minor を選んだ。移行は[ガイド](migration-v1-to-presentation-v2.md)を参照する。
- `protocolVersion: 2`、`recordingVersion: 1`、Form `apiVersion: 1` は製品版とは独立し、今回変更しない。
- `nix/release.json` は公開済み v0.1.0 を固定する。未公開 0.2.0 の asset hash は作らず、公開と導入試験後に別変更で更新する。
- Release readiness: **READY**（レビュー済み候補を公開工程へ進める判断）。Blocker / High の未解決 finding はない。タグ、GitHub Release、`mode=publish` はこの Phase で作らない。公開の承認、公開タグと公開後導入試験は別工程である。

## 検証範囲

Phase 12 の source 実装 commit `24fe562256026b27fd39ea9f3905f4c3a2351235` に対し、[Release `mode=verify` run 36948468392](https://github.com/9uiLe/hamio/actions/runs/36948468392) は macOS 15 arm64、Ubuntu 24.04 x64 / arm64 の build、証明、別 runner での候補検証に成功した。`publish` と `verify-install` は意図どおり skipped。各 runner の `release:verify` は二つの独立 build、SBOM / notices、Bun/Node のない製品実行を検査した。後続の文書のみの commit で head SHA が変わる場合、最新 head の候補検証結果は PR の check を参照する。候補 workflow は公開前の由来と動作を確認するもので、公開済み release の導入試験を代替しない。

ローカル検証は macOS 27.0 arm64 / Chrome 154.0.8037.93。fresh clone から `setup → check（114 tests、21 Catalog scenario）→ build → release:verify` を通し、追跡ファイルに差分なし。0.2.0 native executable を Bun/Node のない PATH と 40列の実 PTY で使用し、static、live、Progress、failure、Recording、Report、Form の経路を確認した。`nix flake check --all-systems --no-build --no-write-lock-file` は3対象の derivation を評価したが、その操作自体は Linux の実行試験ではない。Terminal/HTML、accessibility、性能の具体条件は[最終レビュー](rearchitecture/phase-12-final-review.md)に記録する。

## Security と dependency

- 2026-10-02、固定 Bun 1.4.2（revision `744846f844374847c902b5e7fd59b4342a51ef99`）を [公式 release](https://github.com/oven-sh/bun/releases/tag/bun-v1.4.2)、[release notes](https://bun.com/blog/bun-v1.4.2)、[security policy](https://github.com/oven-sh/bun/security/policy)、[公開 advisory](https://github.com/oven-sh/bun/security/advisories)で確認した。調査時点で Bun repository の公開 advisory は 0 件。未知の脆弱性がないことを保証するものではない。Bun 内部 native 部品の advisory を網羅する検査は **NOT VERIFIED**。
- `@clack/core@1.5.1` は Form の対話 primitive に使用する唯一の直接 production npm dependency。MIT、直接依存 `fast-wrap-ansi` と `sisteransi`、lockfile 上の推移依存は合計4 package。[upstream release](https://github.com/bombshell-dev/clack/releases/tag/%40clack/core%401.5.1)と [organization security policy](https://github.com/bombshell-dev/.github/blob/main/SECURITY.md)を確認した。policy は repository 固有ではなく組織共通。標準 API のみで raw mode、編集、選択、取消、resize を安全に置換するコストが大きく、独自 prompt framework は作らない。
- `bun audit` は46 package を検査し、既知の脆弱性を報告しなかった。GitHub Advisory Database で `@clack/core`、`fast-wrap-ansi`、`sisteransi` に該当する公開 advisory は調査時点で0件。これらの検査は未公開・未登録の問題を否定しない。
- `bun install --frozen-lockfile --ignore-scripts` が成功。`trustedDependencies` は空。追加・更新 npm dependency なし。SBOM は Bun を aggregate として扱い、内部部品の完全な版・許諾リストではない。

## 制約と公開前の判断点

- VoiceOver による実際の読み上げ、全 browser / terminal / OS での視覚的動作、実電源断・filesystem corruption は未検証。semantic HTML、Keyboard/Focus、forced colors、印刷の browser 検証と区別する。
- 通常 Form の対話キー入力 p95 50 ms は未測定。非対話 Form 呼び出し p95 と混同しない。
- branch candidate の3対象 verification は成功した。公開にはレビュー済み master へのマージ、所有者による immutable release 設定確認、タグに対する publish と公開後の導入試験を別途要する。

公開に使う文案は[0.2.0 release notes draft](release-notes-v0.2.0-draft.md)。公開版に付属する final notes と判断を混同しない。
