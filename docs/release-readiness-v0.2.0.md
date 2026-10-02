# hamio 0.2.0 配布候補の評価

本書は公開済み [v0.1.0 の評価](release-readiness.md)を変更せず、Presentation architecture を採用した **未公開**の 0.2.0 候補を評価する。製品の正本は [設計](design.md)、[Presentation API](presentation-api.md)、[Recording 形式](presentation-recording.md)、[Form 契約](interaction-form.md)。

## 版と公開判断

- Candidate product version: **0.2.0**。公開済み 0.1.0 から `render`、`stream`、root `capabilities` と v1 Presentation JSON を削除した破壊的変更である。0.1.1 patch では変更を表せない。まだ 1.0 の安定契約を約束していないため、次の minor を選んだ。移行は[ガイド](migration-v1-to-presentation-v2.md)を参照する。
- `protocolVersion: 2`、`recordingVersion: 1`、Form `apiVersion: 1` は製品版とは独立し、今回変更しない。
- `nix/release.json` は公開済み v0.1.0 を固定する。未公開 0.2.0 の asset hash は作らず、公開と導入試験後に別変更で更新する。
- Release readiness: **PENDING**。Phase 12 の候補検証とレビュー後に確定する。タグ、GitHub Release、`mode=publish` はこの Phase で作らない。

## 検証範囲

Phase 12 の最終的な検証結果、対象 commit、OS 別候補 workflow run は [最終レビュー](rearchitecture/phase-12-final-review.md)へ記録する。ローカル macOS arm64 と CI の各 target は別に扱う。候補 workflow は公開前の由来と動作を確認するもので、公開済み release の導入試験を代替しない。

## Security と dependency

- 2026-10-02、固定 Bun 1.4.2（revision `744846f844374847c902b5e7fd59b4342a51ef99`）を [公式 release](https://github.com/oven-sh/bun/releases/tag/bun-v1.4.2)、[release notes](https://bun.com/blog/bun-v1.4.2)、[security policy](https://github.com/oven-sh/bun/security/policy)、[公開 advisory](https://github.com/oven-sh/bun/security/advisories)で確認した。調査時点で Bun repository の公開 advisory は 0 件。未知の脆弱性がないことを保証するものではない。Bun 内部 native 部品の advisory を網羅する検査は **NOT VERIFIED**。
- `@clack/core@1.5.1` は Form の対話 primitive に使用する唯一の直接 production npm dependency。MIT、直接依存 `fast-wrap-ansi` と `sisteransi`、lockfile 上の推移依存は合計4 package。[upstream release](https://github.com/bombshell-dev/clack/releases/tag/%40clack/core%401.5.1)と [organization security policy](https://github.com/bombshell-dev/.github/blob/main/SECURITY.md)を確認した。policy は repository 固有ではなく組織共通。標準 API のみで raw mode、編集、選択、取消、resize を安全に置換するコストが大きく、独自 prompt framework は作らない。
- `bun audit` は46 package を検査し、既知の脆弱性を報告しなかった。GitHub Advisory Database で `@clack/core`、`fast-wrap-ansi`、`sisteransi` に該当する公開 advisory は調査時点で0件。これらの検査は未公開・未登録の問題を否定しない。
- `bun install --frozen-lockfile --ignore-scripts` が成功。`trustedDependencies` は空。追加・更新 npm dependency なし。SBOM は Bun を aggregate として扱い、内部部品の完全な版・許諾リストではない。

## 制約と公開前の判断点

- VoiceOver による実際の読み上げ、全 browser / terminal / OS での視覚的動作、実電源断・filesystem corruption は未検証。semantic HTML、Keyboard/Focus、forced colors、印刷の browser 検証と区別する。
- 公開には branch candidate の3対象 verification、レビュー済み master へのマージ、所有者による immutable release 設定確認、タグに対する publish と公開後の導入試験を別途要する。
