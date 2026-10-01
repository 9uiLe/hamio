# Phase 6 — Component specification

[Design Direction](direction.md) と [Design Tokens](tokens.md) を [Presentation Model](../rearchitecture/domain-model.md) の各意味へ適用する契約。Phase 7 の Terminal と Phase 8 の HTML が同じ `PresentationState` を受け取る。ここでいう component は描画上のまとまりで、Domain type と一対一の public API ではない。各行の `Terminal` / `HTML` は**仕様**であり、Phase 4 diagnostic renderer の実装や外観ではない。

## Common rules

- すべての state は text を持つ。色・symbol・motion は補助である。`Status` は Task / Run / Message / Result に埋め込む共通の**表示パターン**であり、独立 Domain item や public component にしない。
- `PresentationState.items` の順序を保つ。ContentItem は Task を所有しないため、隣にある Message / Code 等を Task child として indent / disclosure しない。TaskGroup だけが Task を所有する。
- `SourceExtent.truncated` は source 自体の欠落を明記する。折り返し、横スクロール、disclosure、幅による一時省略は別概念であり、欠落を黙らせない。`Cell.redacted` は可視値、空値、JSON null と区別する。
- ContentItem の文字列は HTML で escape、Terminal で制御文字を安全に扱う。表示 layer が raw secret を受け取って隠す設計にはしない。
- HTML の `narrow < 36rem`、`default 36–72rem`、`wide ≥ 72rem` は表示領域幅で判定する。Terminal は 40 列と 80 列を最低レビュー条件とする。狭くても lifecycle state と Failure は消さない。
- HTML の live は動作中の内容だけ [motion contract](tokens.md#5-motion-and-temporal-contract) を適用し、report / replay は初期表示を静止させる。どちらも同一 State を読む。Disclosure の初期状態は下記の component 規則に従う。
- HTML の動的通知は **accepted state change** を UI adapter が coalesce して届ける。renderer は Event を解釈せず reducer を持たない。Run start / finish、Task start / terminal、warning / error の出現を通知候補とし、Failed Run は速やかに通知する。Progress 値の全更新、spinner frame、再描画、同値 update は読み上げない。数値は 10 percentage point 以上の変化か 5 秒以上の経過で最大 1 件へまとめ、terminal Task / Run の通知を優先する。`aria-live` は基本 `polite`、重大な最終 failure のみ `assertive` を検討し、focus を奪わない。実装の通知対象と計測は Phase 8 で確認する。
- Interactive disclosure / horizontal scroller は keyboard 操作と visible focus を持つ。見出し順は Run があれば Run → group / content section → child Task、run なしなら document の Presentation 見出し → item section とする。見出しの番号や大きさを Domain state とみなさない。

## 1. Run

| Field                    | Specification                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Purpose / semantic input | `run: present` の title、id、`RunState`。`run: none` に架空の Run を作らない。                                                             |
| Anatomy                  | title → persistent status → Task / ContentItem を含む ordered body → final Result / Failure。Summary が存在する場合は body 内の独立 item。 |
| States / variants        | `running`, `succeeded`, `failed`, `cancelled`。static snapshot、live、report で意味は同じ。                                                |
| Hierarchy / emphasis     | Run title と status は primary。failed は danger / strong、succeeded は静止しつつ結果を読める。Task 数から Run status を算出しない。       |
| Content rules / density  | 空 Run も表示する。id は metadata。Run Result は本文の成功・失敗件数に吸収しない。body を巨大な一枚の card にしない。                      |
| Motion                   | running には代表 ongoing indicator を許可。終端への transition / notice は一度だけ。report は静止。                                        |
| Accessibility            | HTML の主見出し、状態 text、Failure の accessible 読順。live update は Run terminal を優先通知。                                           |
| Responsive / overflow    | narrow で title・status を別行にしてよい。長い title は折り返し、Failure は常に可視。                                                      |
| Terminal / HTML          | Terminal は見出し行と body の順序、必要なら一つの activity slot。HTML は `<main>` 内の `h1` と順序付き sections。                          |
| Do not                   | input interruption を cancelled と推測しない。全 Task 成功から Run succeeded を推測しない。                                                |

## 2. TaskGroup

| Field                    | Specification                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------- |
| Purpose / semantic input | `TaskGroup` の id、label、`tasks[]` の一段 grouping。                                   |
| Anatomy                  | group label → ordered child Task rows。id は補助 metadata。                             |
| States / variants        | group 自身に lifecycle state はない。子は各 Task の状態を使う。                         |
| Hierarchy / emphasis     | label は group 境界、子は一段だけ内側。group に danger / success 集計 tone を付けない。 |
| Content rules / density  | 子が 0 件でも group label を残す。通常は spacing のみで境界を示し、card にしない。      |
| Motion                   | group 自身に spinner / completion motion はない。child の更新だけ。                     |
| Accessibility            | HTML は group heading と child heading/list の親子関係を保つ。                          |
| Responsive / overflow    | narrow でも child label、status を残し、indent を縮めてよい。                           |
| Terminal / HTML          | Terminal は group 行と一段の indent。HTML は section と heading、Task rows。            |
| Do not                   | child failure から group failed や aggregate Progress を作らない。                      |

## 3. Task

| Field                    | Specification                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Purpose / semantic input | Task id、label、`pending                                                                                                            | running(progress) | Result`。Run 内に残る実行単位。 |
| Anatomy                  | status cue + state text → label → running なら Progress、terminal なら Result / Failure の要点。id は secondary metadata。          |
| States / variants        | pending、running + none / indeterminate / determinate、succeeded、failed、cancelled。determinate の 0 / partial / full は異なる値。 |
| Hierarchy / emphasis     | Active row を primary にし、completed row は secondary に静める。failed は danger / strong とし Failure を近接表示。                |
| Content rules / density  | 基本は compact row。label は省かない。長い Failure で行が伸びても切らない。近い ContentItem を子だと推測しない。                    |
| Motion                   | 選ばれた active 行だけ ongoing、進捗更新は transition、終端 / failure は一度だけ。完了後は静止。                                    |
| Accessibility            | label と state を同じ読順にし、Progress に name を付ける。更新を全件 announce しない。                                              |
| Responsive / overflow    | narrow では status、label、Progress を複数行に分ける。progress 値と state は常に可視。                                              |
| Terminal / HTML          | Terminal は一行優先、狭ければ continuation 行。HTML は row または list item、Failure detail は必要に応じた disclosure。             |
| Do not                   | determinate full を succeeded にせず、Task retry を同じ ID の再開として見せない。                                                   |

## 4. Progress

| Field                    | Specification                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Purpose / semantic input | Task 内の `ProgressState` または独立 `ContentItem.progress` の label と ProgressState。独立 item は公開後 immutable で、反復更新は Task を使う。                                                                                                                                                                                                                                           |
| Anatomy                  | 意味のある label → state text → determinate なら `current / total` → 補助 visual。                                                                                                                                                                                                                                                                                                         |
| States / variants        | none、indeterminate、determinate 0 / partial / total。percentage は任意の補助値。                                                                                                                                                                                                                                                                                                          |
| Hierarchy / emphasis     | 数値と Task state を近接させる。none は compact Task で専用 visual を省けるが、独立 Progress では「進捗情報なし」と示す。                                                                                                                                                                                                                                                                  |
| Content rules / density  | 実値を整数で表示する。割合丸めで実値を隠さない。ETA は Domain にないので作らない。                                                                                                                                                                                                                                                                                                         |
| Motion                   | indeterminate は代表 indicator に ongoing を許可、determinate は数値更新を短く追う。full になっても Task が running なら継続中。                                                                                                                                                                                                                                                           |
| Accessibility            | determinate は accessible name / value / max、indeterminate は名前と総量不明を示す。reduced motion でも state text。                                                                                                                                                                                                                                                                       |
| Responsive / overflow    | narrow では bar より `current / total` を優先。値の桁は可能な範囲で整列。                                                                                                                                                                                                                                                                                                                  |
| Terminal / HTML          | Terminal は `2/4` 等を優先し幅があれば短い bar。HTML の determinate は label 付き `<progress value=current max=total>`。indeterminate は状態 text と、Live の代表箇所だけ `value` を省いた `<progress>`、Report / reduced motion / その他 Task は静止した `role=progressbar` を使う。none は progress element なし。[HTML Standard](https://html.spec.whatwg.org/dev/form-elements.html)。 |
| Do not                   | none を 0%、indeterminate を架空の割合、full を成功としない。                                                                                                                                                                                                                                                                                                                              |

## 5. Message

| Field                    | Specification                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| Purpose / semantic input | `ContentItem.message` の `info                                                              | success | warning | error` と text。 |
| Anatomy                  | level text / optional cue → 本文。                                                          |
| States / variants        | 四段階。Message.success と lifecycle succeeded、Message.error と lifecycle failed は別。    |
| Hierarchy / emphasis     | info / success は軽く、warning は normal、error は strong。本文を色や icon に置き換えない。 |
| Content rules / density  | 一件ごとの card は作らず ordered stream に残す。長文は自然に折り返す。                      |
| Motion                   | warning / error の出現時に一度の notice 可。持続的な点滅は禁止。                            |
| Accessibility            | level と本文を一緒に読む。live 通知は coalesce し、全 Message を alert にしない。           |
| Responsive / overflow    | narrow でも level と本文を保持する。                                                        |
| Terminal / HTML          | Terminal は永続する行。HTML は status text を持つ paragraph/list item。                     |
| Do not                   | Message level から Run / Task Result を変更しない。                                         |

## 6. Result

| Field                    | Specification                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Purpose / semantic input | `Result` union。Task / Run の terminal state、または独立 `ContentItem.result`。                                     |
| Anatomy                  | result kind → success message または cancellation reason または Failure → DataPresence。                            |
| States / variants        | succeeded with `data:none`、succeeded with value（JSON null を含む）、failed(Failure)、cancelled(reason optional)。 |
| Hierarchy / emphasis     | kind は primary。failed は Failure code / human message を直後へ。cancelled は失敗扱いしない。                      |
| Content rules / density  | `none` と `value:null` を別表示。大きな data は summary を先に示し、全文へ到達できる。                              |
| Motion                   | live terminal transition は一度。独立 static Result と report は静止。                                              |
| Accessibility            | kind と data presence を文字で示す。disclosure 内に kind を隠さない。                                               |
| Responsive / overflow    | data が長くても kind は固定して読める。構造化 data は横または縦に inspection 可。                                   |
| Terminal / HTML          | Terminal は kind と要点を永続行、data は続く行。HTML は heading / status と必要なら data disclosure。               |
| Do not                   | boolean success、空 data と JSON null の同一視、Task 集計による Run Result 推測をしない。                           |

## 7. Failure

| Field                    | Specification                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Purpose / semantic input | `Failure` の code、human message、`details: DataPresence`。Result.failed 内と独立 ContentItem の両方。         |
| Anatomy                  | failed / failure の状態語 → code → human message → details。code は machine-readable だが読める位置へ置く。    |
| States / variants        | details none / value(null または構造値)。独立 Failure は Run / Task failed を意味しない。                      |
| Hierarchy / emphasis     | danger / strong。状態語と code をすぐ見つけられ、human message を主に読める。成功した周辺 content を消さない。 |
| Content rules / density  | message は常時可視。details は長ければ disclosure 可、code は隠さない。                                        |
| Motion                   | 出現時に一度だけ notice。以後静止。                                                                            |
| Accessibility            | message と code を同じ読順。重大な Run failure は live で優先通知。赤い背景のみで示さない。                    |
| Responsive / overflow    | narrow でも message と code は可視。details は折り返し / scroll で全内容に到達可。                             |
| Terminal / HTML          | Terminal は永続する失敗行と詳細続行。HTML は色・文字・必要な強い境界、details の disclosure。                  |
| Do not                   | hamio 自身の Protocol / IO error を利用側 Failure に偽装しない。                                               |

## 8. Table

| Field                    | Specification                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose / semantic input | columns、同数の Cell を持つ rows、SourceExtent。比較可能な構造値。                                                                    |
| Anatomy                  | table label / 列見出し → rows → source extent。全 visible cell が数値の列など、比較対象が明確な場合に桁位置を揃える。                 |
| States / variants        | small、large、0 rows、long value、redacted cell、source truncated。                                                                   |
| Hierarchy / emphasis     | 見出しと行の対応を主とし、垂直罫線や card 化を基本にしない。                                                                          |
| Content rules / density  | 0 rows は列見出しと「行なし」を示す。Cell.redacted は `[redacted]`。原文を黙って切らない。                                            |
| Motion                   | 表の値に常時 animation なし。live の新行は位置を一度示してよい。                                                                      |
| Accessibility            | HTML は `<table>`、caption、`<th scope=col>`。横 scroller は keyboard focus と内容の範囲を認識可能にする。                            |
| Responsive / overflow    | narrow HTML は列比較を守る横 scroll を基準とし、card list へ自動変換しない。スクロール可能と分かる cue を置く。                       |
| Terminal / HTML          | Terminal 80 列は見出しと整列列、40 列は各 row を `列名: 値` の連続行へ変え関係を残す。HTML は native table と horizontal inspection。 |
| Do not                   | viewport で省いた列を SourceExtent.truncated と表示しない。redacted を空欄にしない。                                                  |

## 9. KeyValue

| Field                    | Specification                                                       |
| ------------------------ | ------------------------------------------------------------------- |
| Purpose / semantic input | entries[] の key、label、visible / redacted Cell。                  |
| Anatomy                  | label → value の対を ordered list として表示。                      |
| States / variants        | 通常、0 entries、長い値、redacted、visible null。                   |
| Hierarchy / emphasis     | label は secondary、value は primary。表の列比較とは区別する。      |
| Content rules / density  | 空なら「項目なし」。null と redacted を異なる文字で示す。           |
| Motion                   | なし。                                                              |
| Accessibility            | HTML は `<dl><dt><dd>`、値と label の対応を保つ。                   |
| Responsive / overflow    | narrow は label と value を縦にしてよい。長い値に到達可能。         |
| Terminal / HTML          | Terminal は `label: value`、狭ければ続行。HTML は definition list。 |
| Do not                   | metadata を偽の 2 列 Table へ変換しない。                           |

## 10. Code

| Field                    | Specification                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Purpose / semantic input | text、optional language、SourceExtent。                                                                                                    |
| Anatomy                  | Code heading / language metadata → 原文 → source extent。                                                                                  |
| States / variants        | normal、empty、長い行、source truncated。                                                                                                  |
| Hierarchy / emphasis     | 原文を主とし、背景と 1 px border は必要な境界のみに使う。line number は Domain にないため必須にしない。                                    |
| Content rules / density  | empty は「空の Code」と区別できる。language が無ければ推測しない。syntax highlighting は必須要件ではない。                                 |
| Motion                   | なし。streaming 時は追加行の位置のみ一度示せる。                                                                                           |
| Accessibility            | HTML は `<pre><code>`、言語があれば見出しに含める。copy 操作は Phase 8 で利用検証後に決める。                                              |
| Responsive / overflow    | HTML は原文を保持する横 scroll を基準とし、scroll cue を付ける。Terminal は soft wrap と continuation indent、実際の source は変更しない。 |
| Terminal / HTML          | Terminal は等幅の行と language / truncation text。HTML は mono、pre、copy しやすい原文。                                                   |
| Do not                   | 黙った省略、架空の language、自作の multi-language parser / highlighter を追加しない。                                                     |

## 11. Diff

| Field                    | Specification                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Purpose / semantic input | `context                                                                                                   | added | removed` に分類済みの lines、optional source、SourceExtent。差分計算はしない。 |
| Anatomy                  | Diff heading / source → 各行の kind cue と原文 → source extent。                                           |
| States / variants        | context、added、removed、空、長い行、source truncated。                                                    |
| Hierarchy / emphasis     | 行種別は文字 / marker / 色の冗長 cue。変更行を見つけやすくしつつ context を読める。                        |
| Content rules / density  | source 原文を変更しない。line number は与えられていないので作らない。                                      |
| Motion                   | 静止。live 追加があれば位置通知のみ。                                                                      |
| Accessibility            | added / removed / context を文字でも伝え、色だけに依存しない。                                             |
| Responsive / overflow    | HTML は横 scroll を基本、Terminal は行種別を保った soft wrap。                                             |
| Terminal / HTML          | Terminal は `+` / `-` / space と必要な text label、HTML は行ごとの種別 text / semantic grouping と補助色。 |
| Do not                   | 表示のためだけに diff engine を追加しない。                                                                |

## 12. Tree

| Field                    | Specification                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| Purpose / semantic input | nested TreeNode[] と SourceExtent。                                                       |
| Anatomy                  | Tree heading → parent / child 順の nodes → source extent。                                |
| States / variants        | empty、nested、深い階層、長い label、source truncated。                                   |
| Hierarchy / emphasis     | 深さは構造として示す。装飾線より親子関係と読み順を優先。                                  |
| Content rules / density  | empty は「node なし」。深さの表示制限で child を無断削除しない。                          |
| Motion                   | HTML の disclosure に standard transition 可。report 初期は全関係を読める状態を基準。     |
| Accessibility            | HTML は nested list と native disclosure を使うなら expanded / collapsed が分かる。       |
| Responsive / overflow    | narrow では indent を縮小し、ラベルを折り返す。深すぎて読めない場合は親 path を繰り返す。 |
| Terminal / HTML          | Terminal は列幅を守る段階的 indent、HTML は nested list、必要な階層のみ disclosure。      |
| Do not                   | viewport 由来の一時折り畳みを SourceExtent.truncated としない。                           |

## 13. Summary

| Field                    | Specification                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| Purpose / semantic input | headline と points[]。長い実行の要点を再発見する content item。                              |
| Anatomy                  | headline → points。Run Result / Failure があれば近くで参照できるが同一物として上書きしない。 |
| States / variants        | points 0 件 / 複数、長文。                                                                   |
| Hierarchy / emphasis     | section 境界を取り、headline primary、points は body。                                       |
| Content rules / density  | 履歴を消す要約ではない。Run succeeded / failed を Summary の文言から推測しない。             |
| Motion                   | 静止。live 出現時のみ transition 可。                                                        |
| Accessibility            | HTML は heading と list、points の順序を保持。                                               |
| Responsive / overflow    | narrow は折り返し、重要点を隠さない。                                                        |
| Terminal / HTML          | Terminal は最終 section と箇条行、HTML は section / heading / list。                         |
| Do not                   | Task / Message 履歴を Summary のために削らない。                                             |

## 14. Redacted

| Field                    | Specification                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| Purpose / semantic input | 独立 `ContentItem.redacted` または Cell.redacted。秘密の実値は State に入れない。        |
| Anatomy                  | `[redacted]` 相当の文字。Cell ではその位置を維持する。                                   |
| States / variants        | 単独 placeholder と Table / KeyValue cell。                                              |
| Hierarchy / emphasis     | neutral / secondary。隠したことは明確に、秘密の有無を過度に強調しない。                  |
| Content rules / density  | null、空文字、欠落と区別する。tooltip や DOM attribute に原値を入れない。                |
| Motion                   | なし。                                                                                   |
| Accessibility            | screen reader にも「redacted」と分かる text。                                            |
| Responsive / overflow    | 狭くても placeholder を消さない。                                                        |
| Terminal / HTML          | 両媒体で可読な placeholder を表示。HTML は escape、Terminal は制御文字安全性を別途担保。 |
| Do not                   | renderer 側で raw secret を受けて隠す設計にしない。                                      |

## Surface, disclosure, and live/report decisions

| Component                           | Baseline boundary                                            | HTML disclosure default                                                 | Terminal treatment                      |
| ----------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------- |
| ordinary Task / Message / TaskGroup | spacing と alignment。card / border なし                     | lifecycle state は常時可視                                              | 永続行と group indent                   |
| Run / Result / Summary              | section spacing。Run と Summary の境界は strong separator 可 | Result kind と Summary headline は常時可視                              | 見出しと最大 1 空行                     |
| Failure                             | 状態語 + message + code。details に限定 surface 可           | details は live で閉じてもよい。report でも message / code は開いたまま | message / code は持続行、details は続行 |
| Code / Diff                         | subtle surface と normal border                              | 初期は全文へ到達可能。長文折り畳みを導入するなら明示 control            | 原文を読み取れる行表示                  |
| Table                               | 横方向 inspection と必要な header rule                       | 初期は列へ到達可能。列そのものを隠さない                                | 幅で row/column 表現を選ぶ              |
| Tree                                | 親子関係を示す list                                          | report は展開、live の深い枝のみ折り畳み可                              | indent / path                           |
| KeyValue / Redacted                 | border なし                                                  | 原則 disclosure なし                                                    | `label: value` / placeholder            |

Disclosure は native `<details>/<summary>` を第一候補とし、HTML の keyboard と開閉状態を保持する。短い data をすべて隠して click 数を増やさない。live と report の差は初期開閉・motion・announcement・current Task emphasis だけで、別の意味 component を作らない。HTML で hover や色だけの overflow cue は不可。表・code・diff の scroll 領域は keyboard focus が可能で、横方向に続くことを text または構造で知らせる。Terminal は disclosure UI を Web のまま移植しない。

## Catalog review matrix

[Shared Scenario Registry](../../scripts/catalog/scenarios.ts) を Terminal / HTML 共通の入力として使う。以下は Phase 6 specification review の coverage であり、Phase 4 diagnostic PNG の visual 値を採用する意味ではない。Phase 7/8 の実装検証では同じ State を両 renderer へ渡す。

| Scenarios                                                                  | Specification decision to inspect                       |
| -------------------------------------------------------------------------- | ------------------------------------------------------- |
| `task-pending`, `task-running-none`, `task-running-indeterminate`          | pending / running / no progress と動きの有無            |
| `task-running-zero`, `task-running-partial`, `task-running-complete`       | 0 と none、数値整列、full ≠ succeeded                   |
| `task-succeeded`, `task-failed`, `task-cancelled`                          | 終端の静止、Failure と取消の区別                        |
| `run-group-mixed`, `run-failed`, `run-cancelled`, `run-empty-finished`     | Run Result の独立性、group 無状態、空 Run               |
| `messages-all-levels`, `results-all-states`                                | Message と lifecycle の分離、DataPresence               |
| `table-small-empty`, `table-large-truncated`, `table-narrow-long-redacted` | 空行、列比較、source truncation、redaction、横 overflow |
| `code-diff`                                                                | 原文、空 Code、行種別、長文、truncated                  |
| `tree-keyvalue-summary`                                                    | 親子、empty、redacted、要点の再発見                     |

## Phase boundary

この文書は renderer を実装しない。Phase 7 は Terminal の実幅、再描画、実 TTY / non-TTY を検証し、Phase 8 は HTML の browser / keyboard / screen reader / print / forced colors を検証する。Token の値を変える場合はどの scenario と測定が理由かを記録する。外部 dependency は標準機能、既存 utility、小さな internal 実装で満たせない場合だけ security / maintenance review 後に検討する。[開発手順](../development.md#7-依存とツールの更新)。
