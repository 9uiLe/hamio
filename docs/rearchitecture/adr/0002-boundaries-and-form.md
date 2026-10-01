# ADR 0002 — 意味、輸送、媒体、対話入力の境界を分ける

Status: Accepted for Phase 1 design, 2026-10-02.

## Context

現行 `contract.ts` は JSON 契約、フォーム、表示 block、event、処理 error を含む。`application/ports.ts` と `application/command.ts` は `terminal/Appearance` を参照する。現行は Terminal 専用製品として合理的だが、同じ意味を Terminal と HTML に提示する変更では、Terminal 固有の判断が application へ波及する。[Phase 0 監査](../current-state.md)。

## Decision

- Presentation domain は意味型・不変条件・reducer を所有し、輸送、環境、媒体を知らない。Protocol は版付き JSON/NDJSON の ingress/egress を所有する。Domain は protocol frame へ依存しない。
- Terminal と HTML は sibling renderer として State のみに依存する。Terminal の幅・ANSI・TTY と HTML の DOM・CSS・interaction はそれぞれの媒体へ閉じる。CLI/composition root が環境政策と renderer を選ぶ。application の semantic port に `Appearance` を渡さない。
- Form は Presentation Model の item ではなく、Presentation System と並列の **interaction capability** に置く。フォーム回答の検証と未入力・不正値・キャンセルは独立して扱い、Terminal prompt は環境 adapter に置く。今後 HTML でも入力が必要になったときに初めて共通 Form 意味モデルを検討する。
- `presentation`, `protocol`, `interaction`, `terminal`, `html`, `catalog` などはまず論理 module とする。独立配布や release 単位が必要になるまで workspace package を増やさない。共有 `components` package は作らず、共通にするのは意味型である。

## Alternatives considered

1. 現行 Core をそのまま `packages/core` に移す案は、Terminal 由来の Form と輸送契約を Presentation の中心へ固定するため採らない。
2. Renderer 共通の component library を作る案は、同じ見た目を複数媒体へ強要し、実際の共有点である意味状態より大きな境界になるため採らない。
3. Form を直ちに削除する案は、既存の独立した入力用途を失う。Presentation に混ぜず、並列の能力として残す。
4. 設計図の各箱を今すぐ npm package にする案は、DTO、version、build、release の負担が発生する根拠がまだないため採らない。

## Consequences

`contract.ts`、`validation.ts`、`application`、`Appearance` の責務は実装 Phase で移動・分離する。旧 API の互換 wrapper は作らず、切替時に移行ガイドを示す。Form の入力障害やキャンセルは業務の失敗・Presentation の cancelled Result と混同しない。新 package の必要性は Phase 2 の配布設計と Phase 3/4 の import graph で確認する。

独立して変わる判断を境界に閉じ、近くで一緒に変わる内部モデルをむやみに分割しない（[Parnas 1972](https://doi.org/10.1145/361598.361623)、[ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html)）。
