# Phase 0 — 現状監査

対象: `a53a1e4` 時点の作業ツリー。2026-10-02 にソース、仕様、開発・配布設定、試験、プレビューを読み取り調査した。ここに書く新構成は Phase 1 の検証仮説であり、公開契約やデザインの決定ではない。

## 目的と結論

現在の hamio は **JSON を受ける単一実行ファイルの Terminal UI** である。`form` は入力を集め、`render` は単発の `Block[]` を表示し、`stream` は run/task event を検証して端末に進捗を出す。業務処理は利用側にある。端末 I/O の安全性、入力検証、event 順序、録画と配布の知識には再利用価値がある。一方、`Block` と stream の状態は統一された Presentation Model ではなく、HTML renderer・Catalog・Replay は存在しない。

Phase 0 では製品コード・公開 API・プレビュー画像を変更しない。Phase 1 で意味モデルを確定するまで、既存の表示形や package 数を新設計の前提にしない。

## 現在の責務と境界

| 領域                                                      | 現在の責務と主な根拠                                                       | 新設計での判断                                                                                              |
| --------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/core/contract.ts`                                    | API v1 の JSON 型、上限、終了エラー。フォーム、単発表示、stream が同居する | 上限・契約知識は保持。現在の `Block` をそのまま domain に昇格させない                                       |
| `src/core/validation.ts`                                  | JSON 木、閉じた shape、ID、フォーム、表示、event の境界検証                | 未信頼入力の検証規則を保持。transport decode と domain invariant の分離を検討                               |
| `src/core/form.ts` / `redaction.ts`                       | 入力値の解決、秘密表示の除去                                               | 入力収集は Terminal 固有として配置を再検討。秘密値の扱いは両 renderer の共通制約として保持                  |
| `src/core/session.ts`                                     | 一 run の event 順序・task 状態・最終集計                                  | run/task の遷移規則と ID 一意性を保持。新 model に合わせ状態と snapshot を再設計                            |
| `src/application`                                         | CLI 引数、処理手順、出力 batch、失敗応答、port                             | orchestration と機械出力の分離を保持。ただし `ports.ts` と `command.ts` が `terminal/Appearance` に依存する |
| `src/adapters`                                            | 文書・NDJSON 読取、期限付き出力、Clack 入力、Terminal 描画                 | I/O の失敗・背圧・cleanup、TTY 知識を保持。Terminal 専用実装として隔離                                      |
| `src/terminal`                                            | 幅、文字無害化、表、記号、色、フォームの表示計算                           | 文字幅・制御文字対策を保持。現行の visual language と部品外観は廃止                                         |
| `src/cli.ts`                                              | 遅延 import による組み立て、signal 接続                                    | CLI の入口は保持候補。Presentation の中心 API と同一視しない                                                |
| `scripts/release`, `nix`, `.github/workflows/release.yml` | Bun 同梱の native 配布、hash・SBOM・証明・公開                             | 新しい成果物構成に合わせて見直す。既存の配布検証知識は保持                                                  |

現在の依存は概ね `cli → application → core`、`cli → adapters → terminal/core` で、`application/ports.ts` も `terminal/Appearance` を import する。`core` 自体には ANSI・DOM・標準出力の参照はない。ただし `core` は「純粋な presentation domain」ではなくフォームと API v1 の輸送契約も含む。根拠: [基本設計](../design.md#4-内部構成と副作用)、`src/application/ports.ts`、`src/application/command.ts`。

## 現在の Domain Model と状態

| 概念     | 現在の表現                                                                                              | 制約・欠落                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 単発表示 | `DisplayDefinition { blocks: Block[] }`。`message`、`key-value`、`table`、`progress`、`result`、`error` | 見た目に近い flat な block。Task、TaskGroup、Code、Diff、Tree、Summary はない。表示と live は共通 model を使わない |
| Result   | `{ success: boolean; message?; data? }`                                                                 | 成否が boolean。`message` と `data` の不在は optional data と読めるが、failure の構造は明示されない                |
| Progress | 単発 block と event は `current` / `total`。task 内部は `current?` / `total?`                           | 未更新を `undefined` で表し、表示時は `current ?? 0`。`none` と `indeterminate` は model にない                    |
| Run      | `idle → running → finished`、一 runId、seq は 0 から連番                                                | `run.finish` 前の EOF は失敗。run の結果は task の失敗件数から独立                                                 |
| Task     | `task.start` 後に active map、`task.progress`、`task.finish` で削除。終了は succeeded / failed          | pending / cancelled はない。完了詳細は保持せず、成功・失敗件数のみ。表示用の task state 型はない                   |
| Message  | info / success / warning / error の level                                                               | warning / error だけ最終 summary へ保持。通常通知は表示時のみ                                                      |
| Form     | text / secret / confirm / select / multiselect と回答の検証                                             | Presentation の共通概念より対話入力の責務。独立した Terminal 機能として扱う余地がある                              |

`Session.accept` は開始、連番、runId、task ID 再利用、active task 数、進捗の単調増加と total 固定、全 task 終了後の run 終了を検証する。入力 shape と資源上限は `validation.ts` が検証する。`Session.snapshot()` は端末の一行表示向けに「先頭 active task + 件数」を返し、履歴や完全な状態木ではない。根拠: `src/core/contract.ts`、`src/core/session.ts`、[API v1 の連続表示](../api.md#連続表示)。

静的表示と live は別の入口で、`application/run.ts` が event を受理した後、Terminal view へ `message`、`progress`、`result` を直接通知する。`--events` は受理済み event を NDJSON に再送できるが、recording format、replay API、HTML report はない。現行 event 列を保存すれば入力として再利用できる可能性はあるものの、再生時の状態と表示の同等性は現在の契約では保証されない。

## 残す知識と廃止する実装

| 残すもの                                                                                      | 理由                                            |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `Session` の連番、所有 run、task ID 一意性、進捗単調性、終了順序の規則                        | Event replay の決定性と不正入力拒否の基礎になる |
| JSON/NDJSON の閉じた境界検証、Unicode・サイズ・深さ・件数の上限                               | CLI、recording、将来の外部入力を安全に扱うため  |
| stdout の機械応答と stderr の人向け表示の分離、業務の失敗と UI の失敗の区別                   | Script / AI からの利用に必要な意味上の分離      |
| 端末制御文字対策、grapheme と表示幅、TTY 判定、書込の背圧・期限、timer と listener の cleanup | 新しい Terminal renderer でも同じ環境制約がある |
| PTY 実出力の捕捉、操作同期、cast/PNG/GIF、hash manifest の照合                                | Terminal renderer の実物を検証する基盤になる    |
| Nix と Bun の固定、CI/local 同一入口、native 配布の検証手順                                   | 再設計中にも再現性と利用側の更新管理が必要      |

| 捨てる、または移さないもの                                                               | 理由                                                             |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 現行 `Format`、`prompt-view`、fixture の記号・配色・余白を新しい design の基準にすること | UI Design をゼロから作る要件に反する。制御・入力知識は別に残せる |
| 現行 `Block` をそのまま新 Presentation Model にすること                                  | Task や live state を表せず、進捗と結果の state が不明確         |
| `Progress` の「先頭 task と件数」を renderer 共通 model にすること                       | Terminal の一行要約という表示政策であり、完全な意味状態ではない  |
| `form` を無条件に renderer 共通 component にすること                                     | 入力収集と静的な情報提示は責務が異なる                           |
| 互換性だけの旧 API wrapper、旧 visual test、同じ意味の fixture 複製                      | 新しい契約と試験責務を曖昧にする                                 |

## Preview / Catalog の現状

`scripts/preview/scenarios.ts` は **製品操作 1 本と録画基盤の検証 1 本**を持つ。`product` は実 CLI の form → stream → render を動かす。`fixture` は録画基盤を試す専用プログラムで、製品 UI の検証ではない。シナリオはコマンド、PTY サイズ、待機文字列、送信キー、撮影位置を定義し、semantic state の inventory ではない。Terminal と HTML の共通 scenario も、HTML renderer も、Web catalog も存在しない。

`capture.ts` は Bun PTY から実出力を拾い、UTF-8 を逐次 decode し、期待文字列への到達後にキーを送る。出力・event 数・時間に上限を持つ。`render.ts` は asciinema-agg と固定フォントで cast から PNG/GIF を作る。`artifacts.ts` は生成元と画像の SHA-256 を manifest に保存し、`preview:check` が陳腐化を検出する。`docs/previews/` には product/fixture の input/result PNG と manifest があり、操作途中の GIF/cast は `dist/preview/` のローカル専用である。これらは **capture/verification 技術として再利用**し、Phase 4 では共通 semantic scenario から両 renderer へ供給する境界を別途設ける。新しい Catalog の Terminal pane も実 renderer の textual/ANSI/cast に結び付ける。

注意: 現在の `sourceHashes()` は広い `src/**/*` などを含むため、意味に関係ない製品変更でも全画像が古くなる。Catalog の拡張時は scenario ごとの入力と生成手順を追跡し、正確さを落とさず更新コストを抑える必要がある。

## 試験、計測、開発環境、配布

`tests/` は API、runtime、PTY、compiled executable、preview、hooks、配布、release、Nix を扱う 8 ファイルで、`test` 呼び出しは 49 件、別に hook の `describe` が 1 件ある。Domain 単独ファイルはなく、`tests/api.test.ts` が validation・状態遷移・CLI 応答・TTY・端末表を横断する。`tests/runtime.test.ts` は application の独立性、batch の順序・背圧、timer・描画失敗を扱う。`tests/preview.test.ts` は実 PTY、生成元照合、UTF-8、異常終了と timeout を扱う。重複の可能性は `api.test.ts` の stream lifecycle と runtime の event 処理などにあり、Phase 3/4 では domain / protocol / renderer / integration / visual の責務に基づき整理する。現時点で試験を削除する根拠はまだ足りない。

計測スクリプトは `benchmark-api.ts`（起動・呼び出し）、`benchmark-progress.ts`（進捗）、`benchmark-preview.ts`（画像生成）、`benchmark-refactor.ts`（比較）に分かれる。`docs/design.md` は利用側負荷を含む性能予算を定める。これらの測定対象は現在の CLI とプレビューであり、HTML や replay の負荷を測定していない。

単一の private Bun package で、workspace はない。`packageManager` と `engines` は Bun 1.4.2 / Node 24 系を明記し、`bun.lock` と `flake.lock` を固定する。TypeScript は `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`skipLibCheck: false`。Biome は TS/JS/JSON の lint と format、Prettier は Markdown/YAML、nixfmt と shfmt は各言語の format、ShellCheck と actionlint は lint を担当する。現行の formatter は対象拡張子が分かれており、明白な二重 formatter はない。`check` は lint → format check → typecheck → `bun test` → preview hash check。Git hooks は staged check と全 check、Quality CI は Nix shell で依存取得して同じ `bun run check` を実行する。ただし `build` は `check` の外、Catalog command と HTML verification は未定義。Clean checkout は `./scripts/dev.sh bun run setup` → `./scripts/dev.sh bun run check` → `./scripts/dev.sh bun run build` が現在の導線。根拠: `package.json`、`tsconfig.json`、`biome.json`、`flake.nix`、`.github/workflows/quality.yml`、[開発手順](../development.md)。

配布は Bun 同梱の単一 native 実行ファイルと Nix package を対象にしている。Release workflow は 3 platform の候補を生成し、SBOM・notices・attestation と導入試験を扱う。公開済み版や Nix の固定資産と作業中のソースは別物である。新しい package / HTML 資産 / TS API を公開するなら、Phase 2 と Phase 9 で成果物、利用者、バージョン方針を改めて決める必要がある。公開 workflow の変更・実行は Phase 0 の範囲外。

## 既存設計の品質確認

対象は既存 repository の TypeScript 製品コードと、それを囲む設定・preview。ISO/IEC 25010:2023 の観点を使い、静的数値と設計判断を分ける。資産検出: `.github/workflows/quality.yml`、`package.json`、`tsconfig.json`、`biome.json` は存在する。`quality-gate-result.json`、`coupling-gate-result.json`、対応 wrapper はない。品質スキルの言語 profile は Swift のみなので、TypeScript の閾値判定はしない。07a 結合シグナルは未適用。

| 決定論的観測             |                                  実測 | 閾値・判定                  | 出典                                                 |
| ------------------------ | ------------------------------------: | --------------------------- | ---------------------------------------------------- |
| `src` の TypeScript NLOC |                                 1,688 | profile なし、measured-only | `lizard -l typescript src`                           |
| 関数数 / 平均 CCN        |                             123 / 3.6 | profile なし、measured-only | 同上                                                 |
| 最大 CCN                 |                     `parseCommand` 39 | profile なし、measured-only | 同上、`src/application/command.ts:45`                |
| 次点 CCN                 | `Session.accept` 29、`answerIssue` 21 | profile なし、measured-only | 同上、`src/core/session.ts:30`、`src/core/form.ts:3` |

これらの数値だけで合否やリファクタリングを決めない。設計上、CLI から adapter の組立、境界検証、機械応答の分離は妥当。Presentation System へ拡張するには model の分岐と Terminal 依存が設計上の制約になる。対象に既存品質 gate の CI artifact がないため、このスキルとしての総合 verdict は **review-only** とする。外部 tool の未実行指標に合否は付けない。

| 25010 特性   | Phase 0 での判断                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| 機能適合性   | 精査対象。静的・live の意味と欠落 component を確認                                                   |
| 性能効率性   | 精査対象。既存の集約・上限と replay 時の保持量を確認                                                 |
| 互換性       | 精査対象。公開 NDJSON と新 renderer 間の相互運用を確認                                               |
| 相互作用性   | 精査対象。現在は Terminal のみで Catalog/HTML/accessibility 根拠がない                               |
| 信頼性       | 精査対象。event 順序・中断・背圧・録画の失敗処理を確認                                               |
| セキュリティ | 精査対象。制御文字、秘密値、将来 HTML escape の境界を確認                                            |
| 保守性       | 精査対象。model の二重化、依存方向、test 責務を確認                                                  |
| 柔軟性       | 精査対象。Terminal 以外へ同じ意味を展開できるかを確認                                                |
| 安全性       | 該当薄。生命・身体・社会インフラに直接作用するソフトウェアではない。誤表示の影響は機能・信頼性で扱う |

主要な design-level 指摘は次のとおり。重大度は **新しい目標に対する移行リスク**であり、現在の API v1 の障害判定ではない。

1. **High — 保守性 / モジュール性**: `src/core/contract.ts:57` の静的 `Block` と `src/core/session.ts:3` の active task は別々の状態表現で、同じ semantic state を renderer 間へ渡す型がない。Phase 1 で一つの意味モデルと state/event の写像を決め、Phase 3 で変換規則を検証する。根拠: [ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html) の保守性、[Parnas のモジュール分割基準](https://doi.org/10.1145/361598.361623)。数値根拠: なし（構造調査）。差分帰属: 既存設計。
2. **Medium — 保守性 / 修正性**: `src/application/ports.ts:3` と `src/application/command.ts:1` の `Appearance` 依存が、application の出力選択と Terminal policy を結ぶ。Phase 1 で application が renderer 非依存の要求を扱い、環境政策を adapter/CLI に置く境界を検討する。削減する軸は変更伝播先の数と共有する Terminal 固有型である。根拠: [Parnas](https://doi.org/10.1145/361598.361623)、[ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html)。数値根拠: なし（import 調査）。差分帰属: 既存設計。
3. **Medium — 機能適合性 / 完全性**: `src/core/session.ts:87` の snapshot は先頭 task と件数のみで、完了 task を削除するため replay/report の状態源にはならない。event を保存する場合も状態復元の規則と保持上限を設計する。根拠: [ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html)、[API v1 の保持量](../api.md#資源上限と機能照会)。数値根拠: なし（model 調査）。差分帰属: 既存設計。
4. **Medium — 相互作用性 / 自己記述性**: `scripts/preview/scenarios.ts:3` は製品操作 1 本と capture fixture 1 本で、component の状態一覧や幅別比較ができない。共通 semantic scenario に替え、実 PTY capture を新 Catalog に接続する。根拠: [ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html)、[WCAG 2.2](https://www.w3.org/TR/WCAG22/)（将来の HTML 確認基準）。数値根拠: scenario 2 本（コード列挙）。差分帰属: 既存設計。

## 破壊的変更と長期保守リスク

- API v1 の `Block`、Result boolean、event 名と payload、CLI の `render` / `stream`、`capabilities`、出力 JSON、終了状態は、新しい model に応じて変更し得る。変更時は新契約と移行表を先に示す。
- 現在の単一 native 配布は TypeScript API と HTML 資産を配る仕組みではない。package を増やす前に利用者と release 単位を確定する。
- Replay は event の永続化だけでは成立しない。schema version、順序、失敗時の部分列、秘密値、時刻の扱い、状態復元と表示の決定性が必要。
- Secret 指定は key-value/table の値にあり、自由文や `result.data` は利用側責務。HTML report と保存 event では流通範囲が広がるため、同じ規則を無検討で継承しない。
- Phase 4 の共有 scenario を既存 `product.ts` へ押し込むと、フォーム操作と Presentation model の状態列が混ざる。capture の技術と fixture data を区別する。
- 仕様・TypeScript 型・protocol・renderer・Catalog の語彙を別々に増やすと、状態名称と optional の意味がずれる。Phase 1 の glossary と mapping を変更基準にする。
- 設計入力前に既存 PNG や fixture を見た目の基準にすると、ゼロからの Design Language を阻害する。

## Target Architecture の仮説とロードマップ評価

Phase 1 ではまず `Presentation Model / state transitions / protocol events / renderer inputs` の責務を定義する。想定依存方向は `core（意味と不変条件）← protocol（輸送・record）`、`core ← terminal`、`core ← html`、`core ← catalog scenarios`、`terminal + html + scenarios → catalog`。矢印は import 先を示す。CLI と入力フォームは必要な境界で接続する。tokens は domain の前提にせず、renderer の意味語彙を表す design 層へ置く。package の分割は公開単位、依存の切断、テストと配布の必要性を確認してから決める。Phase 1 では `core`・`protocol`・`components`・`tokens` を機械的に個別 package にしない。

提示された Phase 0〜12 の順序は概ね妥当。ただし、Phase 4 の比較可能性には **診断用の最小 renderer** が必要なので、Phase 7/8 の最終 UI 実装を待たずに Terminal と HTML の neutral representation を用意する。これは Design Input Gate を越える最終 visual style の決定ではない。Phase 2 では `build` と Catalog の検査を `check` に入れるか、CI 時間と公開単位に照らして決める。Phase 3 では replay の状態復元を単なる将来課題にせず、recorded event の決定性を小さな domain test で確認する。Phase 9 の TypeScript API/CLI、Phase 10 の report は Phase 1 の語彙から逸脱しないようにする。

Design Input Gate までに安全に進められるのは **Phase 0〜4**: 監査、意味と状態の設計、開発環境の整理、core/protocol と replay 基礎、共通 scenario と診断用 Catalog。最終的な typography、色、余白、記号、動き、Terminal/HTML の visual language は参考資料を受け取ってから決める。

## Phase 0 完了判定

Phase 0 の受け入れ条件である「何を残すか／捨てるか、その理由」は上記の表で説明した。コードや設定の変更はなく、テスト・コメント・抽象の削除も行っていない。`./scripts/dev.sh bun run check` は lint、format、typecheck、66 件の test、preview hash check を通過した。次は Phase 1 で domain/state/event の設計を行う前に、この現状記録を基準として `docs/design.md`・`docs/api.md` との語彙の差分を明示する。
