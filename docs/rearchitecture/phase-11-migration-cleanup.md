# Phase 11 — Migration & Cleanup 実装記録

[Phase 1 migration strategy](target-architecture.md#8-migration-strategy)に従い、削除を責務単位で判断した。v0.1.0 の旧契約は [release tag](https://github.com/9uiLe/hamio/blob/v0.1.0/docs/api.md)と Git history に残す。[移行ガイド](../migration-v1-to-presentation-v2.md)が現行利用者の入口である。Phase 12 の全 Repository review は行わない。

## Legacy inventory と判断

| Module / asset                                                            | 移行前の責務・利用者                                                             | Phase 11 の判断                                                                                                                |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/core/contract.ts`, `validation.ts`                                   | v1 Block / Event と Form の型・JSON 検証が混在。old render/stream/Form が import | Form の型・検証・上限を `src/interaction/`、共用 process error と I/O 上限を `src/application/` へ移し、旧 Presentation を削除 |
| `src/core/session.ts`, `redaction.ts`                                     | v1 stream reducer と Block の secret masking。v1 のみ                            | Phase 3 Session と redacted semantic value に置換済みのため削除。互換 adapter は作らない                                       |
| `src/application/run.ts`, `command.ts`, `ports.ts`, `batch.ts`            | Form/Render/Stream の混在、v1 parser、v1 Event 応答 batch                        | Form 実行・parser を Interaction へ移し、旧 render/stream 分岐と ports/batch を削除                                            |
| `src/adapters/terminal.ts`, `src/terminal/format.ts`                      | v1 Presentation Terminal View と Format                                          | Phase 7 renderer が責務を保持するため削除。Form の notice は prompt 専用に局所化                                               |
| `src/adapters/prompts.ts`, `src/terminal/prompt-view.ts`, `appearance.ts` | 対話 input、secret mask、cursor/resize、Form 固有画面                            | `src/interaction/` へ移動し、Presentation の旧 Format import を除去                                                            |
| `src/adapters/input.ts`, `output.ts`, `src/terminal/text.ts`              | bounded input、write deadline/backpressure、文字安全性                           | Presentation と Form に現在も必要。低レベル責務として保持                                                                      |
| `scripts/preview/`, `docs/previews/`, v1 benchmarks                       | v1 product と fixture の画像、source freshness、旧 API 性能                      | v1 public 経路削除とともに削除。current quality gate から preview check を外す                                                 |
| `scripts/preview/capture.ts`                                              | PTY と UTF-8/cast の bounded capture。Catalog/native tests が import             | 汎用 `scripts/terminal-capture/capture.ts` へ移動して再利用                                                                    |
| `scripts/catalog/`, `docs/catalog-previews/`, `docs/report-previews/`     | 共通 semantic scenario、両 production renderer、現行 HTML Report                 | 保持。Catalog の3 PNG は capture の移動に合わせ再生成・目視確認                                                                |
| `tests/api.test.ts`, `runtime.test.ts`, `preview.test.ts`                 | Form と v1 Presentation が混在、v1 preview                                       | Form の境界・実 PTY・resize・取消を `interaction.test.ts` へ移し、obsolete v1 tests を削除                                     |
| `docs/api.md`                                                             | 公開済み v0.1.0 の API v1 全文                                                   | 現行 tree から削除。release tag に残し、Form 契約を分離、移行ガイドを追加                                                      |

Root `capabilities` は API v1 の列挙のみを持ち、Form 固有 discovery の現行 use case がないため削除した。現行 Presentation の discovery は `presentation capabilities` が担当する。root help は Presentation と Form のみを列挙する。`render` / `stream` alias、v1→v2 mapper、second Session はない。

## 最終の import 境界

`src/presentation` は Protocol / Renderer / Recording / Form を import しない。Protocol は Presentation を decode/encode し、Application が Protocol・Session・Renderer・Recording を組み立てる。Form 契約と Terminal prompt は `src/interaction` にあり、Presentation renderer を import しない。`src/adapters/input.ts` と `output.ts` は generic bounded process I/O、`src/terminal/text.ts` は generic terminal safety。単一 private package を維持する。

## Dependency review — `@clack/core` を保持

`@clack/core@1.5.1` は Form の text、secret、confirm、select、multiselect に必要な raw-mode 入力、cursor/編集、Ctrl-C、選択、resize の基礎を提供する。Bun/Node 標準 API は PTY を扱えるが、これらの編集・選択・取消を安全に完成させる prompt primitive は提供しない。既存の prompt 実装は同 dependency の unstyled API に Form 固有の表示と検証を重ね、実 PTY の回帰テストを持つ。削除は独自 TTY prompt framework と多 OS 保守を生むため、依存ゼロを目的に自作しない。直接 production dependency はこれ一つで、lockfile と native bundle に残る。新規依存はない。

| Review item                  | 2026-10-02 時点の確認                                                                                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| owner / source               | [npm package](https://www.npmjs.com/package/@clack/core) と [bombshell-dev/clack](https://github.com/bombshell-dev/clack)。local package metadata は Nate Moore と同 repository を示す |
| maintenance / release        | upstream repository は 2026-09-22 に push、npm 1.5.1 は2026年9月公開。使用版は lockfile で固定                                                                                         |
| security policy              | repository の専用 `SECURITY.md` と GitHub security-policy endpoint は見つからず **UNVERIFIED**。報告経路の有無を推測しない                                                             |
| advisories                   | GitHub Advisory Database の npm `affects=@clack/core` query は0件、`bun audit --json` は `{}`。未知の脆弱性がない保証ではない                                                          |
| transitive                   | `fast-wrap-ansi@0.2.2` → `fast-string-width@3.0.2` → `fast-string-truncated-width@3.0.3`、`sisteransi@1.0.5` の4 package                                                               |
| lifecycle / native / network | lockfile package entry と local package metadata に install/preinstall/postinstall、native binary、network runtime はない。`--ignore-scripts` で現行 Form 実 PTY test が通る           |
| license / artifact           | package は MIT、local LICENSE を確認。production dependency として native executable / SBOM / notices に含める。追加による差分はなし                                                   |

将来この責務が不要になれば削除を再評価する。依存を維持したことは security risk を無視する決定ではない。

## Build / performance / 検証範囲

macOS arm64、固定 Bun 1.4.2 で Phase 10 の native binary は **62,326,002 bytes**、Phase 11 の作業 tree build は **62,309,490 bytes**（**16,512 bytes 減**）。旧経路を削除しても Bun runtime と Form の `@clack/core` が支配的であり、サイズ削減を目的指標にはしない。`src/core`、旧 Terminal View、v1 parser を current import graph と build entry から除外した。起動時間の差は同一条件の多 sample 比較を未実施であり、性能改善を主張しない。

`bun run check` は Form、Presentation/Protocol、Renderer、Recording/Report、Catalog の current tests を一回で実行する。現行 `presentation` の全入口と Form を native binary / clean PATH で確認し、Catalog の21共有 scenario と代表3 PTY PNG を維持する。`release:verify` は独立 build と asset/inventory を確認する。Nix derivation 評価は実行した platform での native 動作試験ではない。公開済み v0.1.0 を変更・再公開しない。次の release version 判断と全面的な品質再評価は Phase 12 に残す。
