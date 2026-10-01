# Phase 6 — Design tokens and media contracts

[Design Direction](direction.md) を具体化する設計正本。[Component Specification](components.md) はこの語彙を使う。意味の正本は [Presentation Domain](../rearchitecture/domain-model.md) と `src/presentation/model.ts` である。下表は renderer の**表示意図**であって Protocol、Domain State、利用側 API の追加ではない。Phase 4 diagnostic renderer の値を引き継いでいない。

## 1. Boundary and implementation decision

```text
Domain state / ContentItem
        ↓
semantic presentation intent (this document)
        ├── Terminal: text / symbol / optional ANSI / redraw
        └── HTML: text / semantic markup / CSS / motion
```

Phase 6 は文書を正本とし、未使用の `src/design/` module や独立 `tokens` package は作らない。現時点で production v2 renderer は存在せず、値をコード化すると文書と未使用コードの二重管理になるためである。Phase 7/8 でそれぞれの renderer が必要な媒体別値を実装し、共有 intent の一対一対応が実際に必要なら単一 package 内の小さな module に抽出する。HTML と Terminal の値を一つの巨大 object へまとめない。

### Shared semantic vocabulary

| Concern         | Values                                                  | Decision                                                                                                                                           |
| --------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tone`          | `neutral`, `info`, `success`, `warning`, `danger`       | 状態の意味色の役割。色なしでも text が正本。`danger` は lifecycle failure と error Message の両方で利用できるが、その意味は component が区別する。 |
| `emphasis`      | `primary`, `secondary`, `subtle`                        | 読む順序を調整する。重要な状態語・Failure message を `subtle` にしない。                                                                           |
| `attention`     | `quiet`, `normal`, `strong`                             | 一度に競合する強調を抑える。`critical` は現行 Domain に独立の意味がなく追加しない。                                                                |
| `motion intent` | `none`, `ongoing`, `transition`, `notice`, `disclosure` | 時間的な表示目的。Event や状態ではない。`notice` と `transition` は一度だけ。                                                                      |
| density         | compact row baseline                                    | 切替可能な density mode は設けない。媒体別の余白関係で dense を実現する。                                                                          |

Status intent は独立の state union を増やさず、次の mapping で定める。すべての状態で**状態語を持続して表示**する。`motion intent` は通常の live 条件での許可であり、static / report / reduced motion では後述の fallback に置き換える。

| Domain state      | Tone    | Emphasis  | Attention | Motion intent   | Persistent text / distinction                         |
| ----------------- | ------- | --------- | --------- | --------------- | ----------------------------------------------------- |
| Task `pending`    | neutral | secondary | quiet     | none            | `pending`。開始待ちを 0% としない。                   |
| Task `running`    | info    | primary   | normal    | ongoing         | `running`。Progress は別に読む。                      |
| Task `succeeded`  | success | secondary | quiet     | transition once | `succeeded`。履歴から削除しない。                     |
| Task `failed`     | danger  | primary   | strong    | notice once     | `failed` と Task の Failure。                         |
| Task `cancelled`  | neutral | secondary | normal    | transition once | `cancelled`。failed とは別。                          |
| Run `running`     | info    | primary   | normal    | ongoing         | `running`。Task 集計から導かない。                    |
| Run `succeeded`   | success | primary   | normal    | transition once | `succeeded` と Run Result。                           |
| Run `failed`      | danger  | primary   | strong    | notice once     | `failed` と Run Failure。                             |
| Run `cancelled`   | neutral | primary   | normal    | transition once | `cancelled` と任意の reason。                         |
| Message `info`    | info    | secondary | quiet     | none            | `info` と本文。                                       |
| Message `success` | success | secondary | quiet     | none            | `success` と本文。Task / Run を成功にしない。         |
| Message `warning` | warning | primary   | normal    | notice once     | `warning` と本文。                                    |
| Message `error`   | danger  | primary   | strong    | notice once     | `error` と本文。Task / Run の `failed` を宣言しない。 |

`Result` の `succeeded / failed / cancelled` は発行元の結果としてこの tone と attention を用いる。独立 `ContentItem.result` なら `Result` component、Task / Run の Result なら親 component が表示する。`ContentItem.failure` は Failure をそのまま表示し、Run / Task の状態を推測しない。`TaskGroup` は status・tone 集計・motion を持たない。

## 2. Progress contract

| ProgressState   | Persistent representation                                                       | Visual / motion                                                                                         | Forbidden inference                                                |
| --------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `none`          | Task が running なら `running` を残す。単独 Progress は「進捗情報なし」。       | Compact Task row では progress 専用 visual と `none` の文字を省ける。                                   | 0%、停止、pending と同一視しない。                                 |
| `indeterminate` | `running` と「総量不明」相当の text。                                           | live で ongoing indicator を許可。report / reduced motion / no-animation は静止 cue。                   | 架空の percentage や ETA を作らない。                              |
| `determinate`   | `current / total` を常に表示。percentage は幅が許す場合のみ整数丸めの補助情報。 | HTML は数値を伴う progress track、Terminal は数値中心で幅があれば短い bar。更新は transition / redraw。 | `current = total` でも Task `running` のまま。成功への書換え禁止。 |

`0 / total`、途中、`total / total` はいずれも determinate。数字は桁位置を揃える。HTML の `progress` 値と accessible name は本当の `current` と `total` に基づく。source 自体の `SourceExtent.truncated` と表示幅の制約は別に扱う。

Phase 8 の `task-running-indeterminate` を Chrome 154 / macOS で確認すると、native indeterminate `<progress>` は author CSS の animation を停止しても Report / reduced motion で動き続けた。そこで Live の代表箇所だけ native indeterminate `<progress>` を使い、Report / reduced motion / 同時に表示する他 Task は text と静止した `role=progressbar` にする。600 ms 間隔の画面比較で Report / reduced motion が静止し、`Total unknown` が残ることを確認した。これは媒体の motion 方針の修正であり、ProgressState の意味や determinate の native `<progress>` は変更しない。

## 3. HTML palette and themes

**Light と Dark の両方を採用**する。長時間の browser live view では利用者の OS preference に従い、保存・共有する report では browser 表示と印刷の双方で読める必要があるためである。少数の同一 role を 2 theme へ map し、別の component system は作らない。初期表示は `prefers-color-scheme`、print は Light の値を明示する。手動 theme switch と保存方式は Phase 8 の利用検証で判断する。Terminal は user theme を尊重し、この palette を移植しない。

| Role                   | Light     | Dark      | Use                                                     |
| ---------------------- | --------- | --------- | ------------------------------------------------------- |
| `surface.base`         | `#FFFFFF` | `#11161B` | document / report background                            |
| `surface.subtle`       | `#F5F7F8` | `#1B232A` | Code / Diff や構造化 data の限定的な領域                |
| `surface.emphasis`     | `#E9EEF2` | `#26323B` | 選択前の補助的な強調。状態の代用にしない                |
| `foreground.primary`   | `#17212B` | `#F2F5F7` | main text、Run / Task title、Failure message            |
| `foreground.secondary` | `#455463` | `#C2CBD3` | 完了 Task、label、補助説明                              |
| `foreground.subtle`    | `#5D6A75` | `#AEBAC3` | metadata。重要状態語には使わない                        |
| `border.normal`        | `#D3DCE4` | `#40515E` | decorative separator。状態・focus の唯一の cue にしない |
| `border.strong`        | `#7D8994` | `#8B9EAB` | 必要な構造境界と選択輪郭                                |
| `tone.info`            | `#155B91` | `#8FCBFA` | info / running text、link                               |
| `tone.success`         | `#17643B` | `#8BD7AB` | success text                                            |
| `tone.warning`         | `#805600` | `#F1C478` | warning text                                            |
| `tone.danger`          | `#A72824` | `#FFA5A0` | failure / error text                                    |
| `focus`                | `#155B91` | `#A5D4FF` | keyboard focus outline                                  |
| `selection`            | `#E7F0F8` | `#294458` | selected row background。これだけで選択を示さない       |

色の役割は CSS custom property 等へ Phase 8 で写す。`tone` は前景色として指定し、背景に同じ色を薄めて流用しない。選択行は `border.strong` の輪郭と state text を併用する。link / focus は hover だけで判別させない。`border.normal` は非 text contrast を保証する線ではない。

### Contrast verification

[WCAG 2.2 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum) の通常 text 4.5:1、[1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast) の意味を担う非 text 3:1 を基準にした。sRGB の相対輝度式で全候補を計算した結果（小数第 2 位表示、判定は丸め前）:

| Checked combination                                                      | Light minimum | Dark minimum | Requirement |
| ------------------------------------------------------------------------ | ------------: | -----------: | ----------: |
| primary / secondary / subtle text × base / subtle / emphasis / selection |        4.75:1 |       5.15:1 |     ≥ 4.5:1 |
| info / success / warning / danger text × 同 4 surface                    |        5.53:1 |       5.40:1 |     ≥ 4.5:1 |
| focus outline × 同 4 surface                                             |        6.12:1 |       6.53:1 |       ≥ 3:1 |
| strong border × 同 4 surface                                             |        3.06:1 |       3.67:1 |       ≥ 3:1 |

表は指定した単色の組合せだけの検証である。opacity、重ね合わせ、実際の antialias、browser forced colors を含む最終実装は Phase 8 で再確認する。`foreground.subtle` をさらに薄めない。focus は 2 px の outline と 2 px の offset を基準とし、隣接要素や sticky UI に覆われないようにする。

## 4. HTML typography, spacing, and geometry

Web font は配布しない。`font-family: system-ui, sans-serif`、原文・識別子は `ui-monospace, SFMono-Regular, Consolas, monospace` を baseline とする。OS の CJK fallback を使い、`lang` を正しく付ける。font 取得・ライセンス・CJK subset・ロード遅延を増やさず、Geist 等を見た目の類似だけで導入しない。各 OS と CJK の実測は Phase 8 の visual / accessibility review に残す。Terminal の font family は指定しない。

| Text role | HTML value                            | Semantic use                                      |
| --------- | ------------------------------------- | ------------------------------------------------- |
| heading   | 18 px / line-height 1.35 / weight 600 | Run と section の見出し                           |
| body      | 15 px / 1.5 / 400                     | 説明、Message、Failure message                    |
| label     | 14 px / 1.4 / 500                     | Task 名、status text、table header                |
| metadata  | 13 px / 1.4 / 400                     | ID、language、source extent、補助値               |
| code      | 13 px / 1.5 / 400 / mono              | Code、Diff、識別子の原文                          |
| number    | 13 px / 1.4 / 500 / tabular-nums      | progress、counts、duration、比較可能な table 数値 |

Identifier は `code` の役割を再利用し、別 token を作らない。数値だけのため全 UI を mono にしない。HTML の数値は `font-variant-numeric: tabular-nums`、必要なら mono fallback。Terminal は同一列で右寄せできる場合に桁を揃え、CJK と grapheme width を実測して列崩れを防ぐ。duration は計測可能な metadata がある場合だけ出す。現行 `PresentationState` は timestamp を持たない。

| Spacing relationship | HTML value | Terminal translation                             |
| -------------------- | ---------: | ------------------------------------------------ |
| `within`             |       4 px | 同一行の区切り、原則追加行なし                   |
| `related`            |       8 px | 関連する行を連続させる                           |
| `group`              |      16 px | group 境界で最大 1 空行                          |
| `section`            |      24 px | Run / 大きな content の境界で最大 1 空行と見出し |

Task row は最小 32 px の高さ、上下 4 px / 左右 8 px を基本とし、折り返した内容は自然に伸ばす。操作可能な箇所は少なくとも 24×24 CSS px の hit target を持つ。Table cell は上下 6 px / 左右 8 px。固定高さで CJK、長い Failure、200% zoom を切らない。HTML 容器幅による `narrow < 36rem`、`default 36–72rem`、`wide ≥ 72rem` を仕様確認条件とする。viewport だけでなく埋込先の**表示領域幅**で判定し、同じ意味を隠さず配置を変える。Phase 4 Catalog の 360 / 640 px は narrow / default の代表値であり token 値の由来ではない。

`border.width = 1px`、`radius.container = 4px` を必要な Code / Diff 等の囲みにだけ使う。ordinary Task、Message、TaskGroup、Result は原則 border と shadow を持たない。shadow token は設けない。浮遊 UI が必要と確認されるまで shadow を追加しない。

## 5. Motion and temporal contract

| Token / rule      | Value                        | Use                                          |
| ----------------- | ---------------------------- | -------------------------------------------- |
| `motion.fast`     | 120 ms                       | 一度だけの attention cue、短い状態切替       |
| `motion.standard` | 240 ms                       | determinate update、HTML disclosure          |
| `motion.ongoing`  | 1000 ms cycle                | running / indeterminate の限定的な indicator |
| `motion.ease`     | `cubic-bezier(0.2, 0, 0, 1)` | fast / standard のみ。ongoing は linear      |
| `motion.off`      | 0 ms                         | reduced motion、report、静止状態             |

色の点滅、位置を大きく動かす transition、scroll position を変更する motion は採用しない。HTML は opacity / transform 等の限定 property を指定し、`transition: all` を使わない。layout box の寸法は固定したまま更新する。running / indeterminate indicator は同一領域に一つを基本とし、全 Task に連続 animation を付けない。Task completion と warning / failure arrival の cue は**一度だけ**、completed Task / Run に loop を残さない。Streaming は新しい行の出現位置を短く示せるが auto-scroll で読書位置を奪わない。

[WCAG 2.2 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide) に従い、HTML で 5 秒を超える自動連続 motion を他の内容と並行表示する live view には、motion を pause / stop できる操作を置く。自動更新を読みながら止めたい人には live view の表示更新・auto-scroll・通知を一時停止し、再開時に最新の State へ移れる操作を用意する。これらの操作は業務実行・Domain event の受理を止めない。`prefers-reduced-motion: reduce` では ongoing animation を静止 cue、fast / standard を 0 ms、notice を持続する text emphasis に置換する。[2.3.3 の説明](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions) も参照する。Report / replay の初期表示は静止し、live の経過時間を偽装しない。

Terminal TTY では running の代表 indicator 一つに限り ASCII の `| / - \\` frame を 250 ms 間隔（最大 4 fps）で使える。Progress 等のデータ更新描画は最大 10 fps に coalesce し、Run 見出しと変化した active row に範囲を限定する。completed row は固定し、warning / failure は永続行として出す。redraw に失敗する環境や non-TTY、animation-disabled の設定では spinner を静止 `>` に替え、状態語と `current / total` を残す。animation-disabled は color-disabled と独立させ、公開設定の形は Phase 7 で決める。terminal capability を Domain State に入れない。

## 6. Terminal color and symbols

No-color は常に完全な表現であり、status text が最優先。TTY かつ色が許可される場合のみ基本 ANSI の **前景色**を補助として使う。`NO_COLOR` が非空なら ANSI color を出さない。[NO_COLOR convention](https://no-color.org/) に従う。256 色 / true color は要求せず、色の数が多い環境でも当面は同じ基本 mapping を使う。背景色を変更せず user theme を尊重する。無色出力、pipe、録画、未知の端末では色なしを既定とする。実端末での contrast は制御できないため、ANSI color を唯一の区別にしない。

| Intent              | Optional basic ANSI foreground | Persistent ASCII cue + text                                    |
| ------------------- | ------------------------------ | -------------------------------------------------------------- |
| pending / neutral   | default                        | `. pending`                                                    |
| running / info      | cyan                           | `> running`。TTY で選んだ一つの active indicator のみ frame 可 |
| succeeded / success | green                          | `+ succeeded`                                                  |
| failed / danger     | red                            | `! failed` と Failure                                          |
| cancelled / neutral | default                        | `- cancelled`                                                  |
| Message info        | cyan                           | `i info`                                                       |
| Message success     | green                          | `+ success`                                                    |
| Message warning     | yellow                         | `! warning`                                                    |
| Message error       | red                            | `! error`。Task / Run failed とは別の語を残す                  |

ASCII のみを必須とし、emoji / Unicode icon / box drawing glyph は使わない。glyph 幅は 1 列、fallback で text は同じ。Run と Task で symbol を共用しても、名称と種類を省略しない。HTML はこの ASCII symbol set を強制せず、status text と必要なら `aria-hidden` の補助 marker を用いる。Status 数個のための icon library は導入しない。
