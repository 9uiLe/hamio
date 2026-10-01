# hamio Design Direction — Phase 5

## Design intent

hamio は AI、Script、Application が人間へ提示する実行状態と情報を、Terminal と HTML で理解できる形にする。利用者がまず知るべきことは「今何をしているか」「どこまで進んだか」「最近何が起きたか」「何が失敗したか」「最終的にどうなったか」である。[Presentation Domain](../rearchitecture/domain-model.md) が意味の正本であり、媒体はその意味を表現する。

方向性は **Calm, Dense, Precise, Operational** とする。Calm は情報を減らすことではなく、意味を持たない装飾と競合する強調を減らすこと。Dense は長い実行履歴を短い探索距離で読めること。Precise は状態・数値・欠落・失敗を曖昧にしないこと。Operational は美的な印象より現在の作業、異常、次に読む場所を優先すること。時間のある UI では **Purposeful Motion** を加える。動きは実行の継続や変化を認識しやすくするが、意味の唯一の手掛かりにはしない。

この文書は Phase 6 の token と component specification に渡す**原則**である。Phase 4 の diagnostic renderer と PNG、既存 v1 の画面は Final Design Reference ではない。ここでは具体的な色・フォント・寸法・記号・animation 値を決めない。

## Reference analysis

以下の「観察」は各提供元の公開資料で確認できる記述または UI 例であり、「なぜ機能するか」以降は hamio 側の解釈である。ログインが必要な application 内部画面について、公開資料から読み取れない細部は断定しない。

| Reference    | Observed pattern — source / evidence                                                                                                                                                                                                 | Why it works — hamio の解釈                                      | What does not fit hamio                                                            | Extracted principle                              | Terminal translation                                                     | HTML translation                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Linear       | [2026 UI refresh](https://linear.app/now/behind-the-latest-design-refresh) は主内容より sidebar を控えめにし、icon と separator を減らし、密度を維持すると説明する。                                                                 | 注意を作業対象へ戻し、行間の探索を速める。                       | Issue / Project navigation と固有の app chrome。                                   | 重要度に応じて視覚的な主張を配分する。           | 実行行を主役にし、補助 metadata と罫線を控える。                         | Run / Task と supporting output に差をつけ、周辺 UI を静かにする。                         |
| Linear       | [2024 redesign](https://linear.app/now/how-we-redesigned-the-linear-ui) は sidebar、tab、header、panel の整列と階層・密度を検証し、list 等の複数 view で stress test した。                                                          | 密な表示でも位置と関係が予測できる。                             | 特定の L 字型 shell、issue detail layout。                                         | alignment と全状態での検証を先にする。           | 状態、名称、数値の列位置を安定させる。                                   | 行の alignment、group と detail の読み順を保つ。                                           |
| Vercel       | [Deployment dashboard の公式説明](https://vercel.com/docs/deployments) は一覧から deployment detail、resources、logs、error へ移れる構造を示す。                                                                                     | 概要から根拠へたどれるため、問題調査を続けやすい。               | Deployment / Project 固有の navigation と操作。                                    | 状態から証拠へ辿れる階層。                       | 失敗 code と message の後に details / 関連 output を追える順序にする。   | 要約を先に置き、detail と長文を必要に応じて開ける。                                        |
| Vercel       | [Geist Typography](https://vercel.com/geist/typography) は heading、label、copy、mono と tabular な数値の役割を分ける。[Geist Table](https://vercel.com/geist/table) は比較可能な列に表を用い、数値の整列を勧める。                  | 数値比較と文章読解を別々に助ける。                               | Geist の font family・サイズ・component API。                                      | 文字の役割を内容に合わせる。                     | 数値・code・表を列として整列し、説明文を無理に表にしない。               | 説明文は読める本文、code と識別子は等幅、比較値は tabular にする。                         |
| Vercel       | [Geist Status Dot](https://vercel.com/geist/status-dot) は進行中のみ動き、終端で静止し、色以外の label も持つ。[Web Interface Guidelines](https://vercel.com/design/guidelines) も redundant status cue と keyboard focus を求める。 | 状態変化に気付きやすく、色や motion を使えない場合も意味が残る。 | Vercel 固有の deployment state 名と dot の造形。                                   | 状態語を正本にし、cue を重ね、終端を静止させる。 | 動く表示と常時読める状態語を組み合わせる。                               | status text、必要に応じた symbol / color / motion と accessible semantics を組み合わせる。 |
| Vercel       | [Geist Colors](https://vercel.com/geist/colors) は背景、境界、主・副 text を役割で分ける。[Guidelines](https://vercel.com/design/guidelines) は focus、reduced motion、空・密・error state を挙げる。                                | 表面の装飾と意味の強調を混同しない。                             | Vercel の brand palette、shadow、radius。                                          | 色は意味と階層を補助する。                       | user theme に従う semantic emphasis を使い、無色でも読める。             | neutral を基調に、意味色と明確な focus を設ける。                                          |
| Beautiful UI | [Loading / Thinking / Streaming](https://www.beautifului.dev/) は経過時間、展開可能な trace、逐次追加の回答を例示する。                                                                                                              | 長い処理でも停止と進行を見分け、最近の出来事を追える。           | pixel-grid loader、推論内容の常時公開、chat composer。                             | 作業の継続と recent output を別々に示す。        | running Task と indeterminate、追記される Message を安定した行順で出す。 | running Task を見失わせず、追加出力の位置を穏やかに知らせる。                              |
| Beautiful UI | [Tool Chips / Task Rows](https://www.beautifului.dev/) は tool call の小さな単位と、running・failed・completed の作業行、`12/12` や `68%` を示す。                                                                                   | 個別行の状態と進捗を近接させ、大量の作業を走査できる。           | Tool Chip / Thinking Card を Domain type にすること、すべてを capsule にすること。 | 行単位の実行状況と数値を近接させる。             | Task 行に state と progress を置き、完了行は静かに残す。                 | Task list と supporting output を階層化し、必要な詳細だけ展開する。                        |
| Beautiful UI | [Diff Table / Records Table / Code Block](https://www.beautifului.dev/) は変更、密な記録表、行番号付き code と diff の例を見せる。                                                                                                   | 構造化情報を文章に潰さず、比較箇所を見つけられる。               | CRM 固有の列、提案承認 UI、component の見た目。                                    | content の種類に合った読み方を保つ。             | diff の行種別、table の列、code の原文を失わない。                       | native table、code/pre、変更行のラベルと overflow を使う。                                 |

### Linear — What works / What does not fit

Visual noise を抑えても情報の密度は保てるという観察が有効である。2026 refresh は icon や separator の削減を説明する一方、navigation と main content の区別を強めている。[公式記事](https://linear.app/now/behind-the-latest-design-refresh)。hamio では navigation より実行履歴・警告・結果を優先する。Linear の workspace shell、issue 画面、ブランドの輪郭は採用しない。Terminal は安定した行頭と限定的な強調、HTML は主内容と補助情報の明確な階層へ翻訳する。

### Vercel — What works / What does not fit

Dashboard の概要から logs / resources / error へ進む構造、Geist の状態・数値・表の用途の区別が有効である。[Deployments](https://vercel.com/docs/deployments)、[Table](https://vercel.com/geist/table)、[Status Dot](https://vercel.com/geist/status-dot)。hamio では特定 deployment の概念や Geist の見た目を移植しない。Terminal でも HTML でも Run の状態から根拠となる Task、Failure、Code、Diff、Table へ追えるようにする。

### Beautiful UI — What works / What does not fit

長時間の AI 作業を loading、task rows、recent output、code / diff / table に分けて見せる発想が hamio の用途に近い。[公式 component gallery](https://www.beautifului.dev/)。ただし Approval Card は入力・承認の interaction capability であり Presentation Domain の内容型ではない。Thinking も現在は `Task.running` と `Progress.indeterminate`、公開してよい Message で表現する。内部推論の表示や tool chip という外観を新たな Domain State として追加しない。

### 共通項と固有性

三者に共通して有効なのは、主内容と補助情報の重み付け、状態と内容の近接、構造化情報の走査性である。Linear の workspace chrome、Vercel の brand system、Beautiful UI の個々の animation / card は各製品に固有である。hamio は実行状態の意味と証拠を中心に翻訳し、見た目の平均を作らない。

## Extracted design principles

1. **Calm — 視覚ノイズを減らす。** すべての Task を強調せず、active、warning、failure、result に必要な注意を残す。内容量は削らない。
2. **Dense — 行単位で走査できる。** Task と最近の出力を近くに置き、related item 内の間隔を詰め、group boundary にだけ明確な余白を使う。すべてを card にしない。
3. **Precise — 状態を言葉と構造で伝える。** `pending / running / succeeded / failed / cancelled`、`none / indeterminate / determinate`、Message level を混同しない。数値と単位を読み取れるようにする。
4. **Operational — 問題から根拠へ辿れる。** Run の現在または最終状態をすぐ把握し、Task、recent output、Failure code / message / details、Summary へ進める。失敗は成功した周辺情報を消さない。
5. **Purposeful Motion — 時間的な変化を補強する。** 実行中と更新時には動きを検討し、終端状態は静止させる。motion がない環境でも同じ意味が残る。

## Hierarchy and density

意味の階層は Run → TaskGroup → Task、加えて順序を持つ ContentItem、Run の最終 Result / Failure と Summary である。`PresentationState.items` の意味上の順序を壊さない。**現行 Domain は ContentItem と特定 Task の所有関係を表していない**ため、近くに現れた Message / Code 等を Task の子だと断定しない。TaskGroup は集合を示すが自身に成功・失敗 state はない。`Message.error` は `Task.failed` または `Run.failed` の代用ではない。Run の結果は Task の成功件数から推測しない。

長時間実行では、active Task と最近の出力をそれぞれ見つけやすくし、完了 Task は履歴として残しつつ静かにする。warning は流れの中で識別可能に残し、failure は scroll で失われたように見せず、失敗した Run / Task が持つ Failure を近接させる。Summary は結果を再読する入口であり、履歴の代替ではない。密度のために内容を暗黙に切り捨てない。`SourceExtent.truncated` は source の欠落を明示し、狭い表示での一時的な折り返し・横スクロールとは区別する。

HTML では Task list は基本的に row とし、Failure details、長い output、Code、Diff、Table 等は意味上のまとまりが必要な場合にだけ独立した surface を使う。Terminal では連続行、順序、字下げ、限定的な空行を使い、箱や罫線を重ねない。どちらも state label、名称、数値の位置が更新のたびに不必要に揺れないようにする。

## Typography and numeric strategy

説明文と人間向け message は読みやすい本文の役割、見出しは Run / group / section の位置を示す役割とする。識別子、code、diff、端末出力は原文を識別しやすい等幅の役割とする。進捗、件数、時間、Table の比較可能な数値は桁位置を揃える。HTML の UI sans / monospace、tabular numbers の使い分けは役割として定めるが、font family は決めない。Terminal では利用者の font を前提に列の安定性を設計する。CJK、fallback、license、Web 配布時の負荷は Phase 6 で評価する。

## Spacing, status, progress

余白は同じ item 内、関連 item 間、group 間の順に関係を示す。長い Task list で各行を大きな block にしない。具体的 scale は Phase 6 で決める。

Task / Run の状態語は Domain の `pending`、`running`、`succeeded`、`failed`、`cancelled` を正本とする。Message の `info`、`success`、`warning`、`error` は別軸である。Task の failed は Failure を伴い、Failure は code → human message → details の順に読めるようにする。Cancelled を failed と同じ注意度にしない。warning と error message は Task / Run の終端を自動的に宣言しない。状態は可読な text を必須 cue とし、必要に応じて symbol、意味色、強調を重ねる。選択 / focus は作業状態とは別の cue にする。

| 意味状態                    | 注意の配分                       | 持続する文字情報                                |
| --------------------------- | -------------------------------- | ----------------------------------------------- |
| Task `pending`              | 低い。開始待ちを識別できる       | `pending` と Task 名                            |
| Run / Task `running`        | 現在の作業として高い。動きは補助 | `running` と名称、Progress があればその種類と値 |
| Run / Task `succeeded`      | 履歴として残し、強調を静める     | `succeeded` と結果の要点                        |
| Run / Task `failed`         | 高い。失敗箇所と根拠へ視線を導く | `failed`、Failure code、message                 |
| Run / Task `cancelled`      | 終端として明瞭、失敗とは別の扱い | `cancelled` と reason があればその内容          |
| Message `info` / `success`  | 本文を優先し、短い補助 cue       | level と本文                                    |
| Message `warning` / `error` | 流れの中で持続的に識別できる     | level と本文。Run / Task の結果は変えない       |

Progress は `none` を「進捗情報なし」、`indeterminate` を「作業中だが総量不明」、`determinate` を「`current / total` が既知」と表す。`none` を `0%` にしない。`indeterminate` に推定 percentage を捏造しない。`determinate` では実数値と総量を近接させ、0、途中、上限到達を読めるようにする。`current = total` は Task / Run の `succeeded` を意味しない。progress の visual indicator は数値の補助であり、数値・状態語を置き換えない。[Geist Progress](https://vercel.com/geist/progress) の実上限と名前付き作業を併記する考え方を参考にする。

## Loading, working, and motion

Loading / Thinking / Working は UI 上の呼び方として検討できるが、新しい Domain state にはしない。通常は running Task、indeterminate / determinate Progress、必要なら公開済み Message / recent output から表現する。開始前の pending と実行中の running を区別する。現行 `PresentationState` に時刻はないため経過時間を捏造しない。将来、計測可能な metadata を導入するなら別途責務を検討する。

Motion は次の目的にだけ使う。exact duration、easing、spinner frame はここでは決めない。

| 場面                    | Motion の目的                            | 動きがない場合に残す cue                           |
| ----------------------- | ---------------------------------------- | -------------------------------------------------- |
| running / indeterminate | 継続中であることを知らせる               | `running` の文字と Task 名、indeterminate の状態語 |
| determinate update      | 前回値からの変化を追う                   | `current / total` と必要なら割合                   |
| Task completion         | running から終端への変化を一度認識させる | succeeded / failed / cancelled の文字と持続する行  |
| streaming output        | 追加位置を追いやすくする                 | 安定した順序と新しい行の本文                       |
| HTML disclosure         | 詳細と親項目の空間関係を示す             | 開閉状態、見出し、keyboard 操作                    |
| warning / failure       | 出現時に一度注意を向ける                 | 持続する状態語、Failure code / message             |

完成済み Task、Run、Failure は継続して動かさない。大量の spinner、常時点滅、長い transition、scroll を乱す animation、layout shift、decorative loop を避ける。短い処理を一瞬だけ表示してちらつかせることも避け、必要なら表示開始を控えめにする。これは実行事実を隠すことを意味しない。[Vercel Guidelines](https://vercel.com/design/guidelines) と [Status Dot](https://vercel.com/geist/status-dot) の継続中のみ動く考え方を参照する。

HTML は `prefers-reduced-motion` を尊重し、連続 movement を静止 cue に、transition を短縮または省略しても状態と最近の変化を読めるようにする。animation 要素ごと内容を `display:none` にして意味を消さない。screen reader 向けの状態更新は頻繁な progress event をそのまま全件読み上げさせず、意味のある変化を適切に通知する。

Terminal の motion は spinner、progress redraw、live Task 更新、streaming line として考える。画面全体を常時再描画せず、変化した範囲と頻度を抑え、cursor 安定性、flicker、output churn、CPU、端末負荷を確認する。複数の active Task すべてに spinner を付ける必要はない。non-TTY では継続的 redraw に依存せず、状態語と持続する行を出す。warning / failure は一過性の animation だけで消さない。

## Color, symbols, borders, and surfaces

色は neutral、secondary metadata、running、success、warning、danger / failure、selection、focus の**意味役割**に限って定義する。success / warning / failure を同じ彩度で競わせず、failure と focus に必要な明瞭さを確保する。色だけで状態を伝えず、無色出力でも意味が残る。Terminal の色は利用者の theme に依存するため HTML と同じ色値を要求しない。

Symbol は状態の走査を補助するが、文字の代替にはしない。platform / font で欠ける場合も state label を残す。Terminal と HTML で同じ glyph を強制しない。decorative icon の反復を避ける。

Border / surface は意味上の境界が spacing や alignment だけでは読みにくいときに使う。Table の列関係、Code / Diff の原文、Failure details、Summary 等は候補となる。Task 一件ごとや短い Message 一件ごとに card を設けない。HTML の背景・border・shadow は独立に必要性を判断する。Terminal へ Web の card / radius を模倣した box を持ち込まない。

## Code, Diff, Table, KeyValue, Tree, and Summary

- **Code:** 原文と改行を尊重し、language metadata があれば補助情報として示す。長い行は読める折り返しまたは明示的な横方向 inspection を選び、黙って欠落させない。空 code と `SourceExtent.truncated` を区別する。
- **Diff:** added / removed / context は色以外の marker または text でも区別する。行の対応と長い行の原文を保つ。HTML の色だけの変更表示も Terminal の記号だけの表示も避ける。
- **Table:** 比較可能な列を保ち、数値は揃える。空行、長文、redacted cell、source truncated を明示する。狭い環境で card へ無条件変換すると列比較が壊れるため、横方向 inspection、折り返し、見出しの再提示を内容に応じて選ぶ。
- **KeyValue / Tree:** key と value、親と子の関係を明示する。redacted は値がないことや JSON null と混同しない。深い Tree は関係を失う切り詰めをしない。
- **Summary / Result:** 最終状態と要点を短く走査できるようにする。`succeeded` で data なし、data として `null`、`failed`、`cancelled` は異なる意味のまま示す。長い machine data は利用可能にしつつ、先頭の結果を埋めない。

## Terminal translation

Terminal の材料は text、行順、字下げ、空行、symbol、emphasis、semantic color、redraw、持続する出力である。Run / TaskGroup / Task は行の関係で示し、active Task と直近の output を同じ実行の流れで見つけられるようにする。ContentItem を根拠なく特定 Task の下へ字下げしない。完了 Task は履歴として残し、動きを止める。warning と failure は状態語と内容を持続させる。Result と Summary は長時間の出力後でも探索可能な区切りを持つ。Code / Diff / Table は原文と構造を守り、狭い幅では欠落を隠さない。TTY の motion は限定的な差分更新、non-TTY は安定した plain text とする。

## HTML translation and responsive behavior

HTML の材料は semantic HTML、見出し、list、table、code / pre、spacing、surface、layout、focus、keyboard interaction、disclosure、motion である。Run と Task の状態・名称を本文の読順で示し、重要な状態を accordion の奥へ隠さない。Failure details、長い Task output、Tree、Diff、structured result data は補助的に開ける。操作があれば native control を優先し、focus を見失わせない。

狭い viewport でも意味を削除しない。secondary metadata は折り返しや別行へ移してよいが、状態と Failure は残す。Table / Code / Diff の横方向 inspection が必要なら overflow を知覚可能にし、原文へ到達できるようにする。最終 breakpoint と layout mechanics は Phase 6 以降で検証する。

## Accessibility principles

色・symbol・motion は単独で意味を担わない。状態は可読な text と適切な構造を持つ。HTML は意味ある document order、見出し階層、native table semantics、可視 focus、keyboard 操作、reduced motion、十分な contrast を前提とする。Live 更新の通知は読み上げ負荷を考慮する。Terminal は色なし・Unicode 制約・non-TTY でも状態が読める。Code と Table の桁、折り返し、横 overflow、redaction と source truncation は視覚能力や viewport によらず識別できるようにする。

## Shared intent and media-specific realization

共通にするのは semantic hierarchy、status importance、attention level、density intent、motion intent である。`PresentationState` に font、CSS、ANSI、spinner、viewport を入れない。媒体固有にするのは exact color、font、symbol、border、shadow、layout、animation と redraw mechanics である。Terminal と HTML が同じ `PresentationState` を受け取っても、行や pixel が一致する必要はない。

## Phase 4 Catalog による適用確認

[Shared scenarios](../../scripts/catalog/scenarios.ts) は判断を試すための状態一覧であり、現在の diagnostic output の外観を採用するための見本ではない。Phase 6 以降、Task pending / running / terminal、Progress none / indeterminate / 0 / partial / full、Message 四段階、Run と TaskGroup、結果と失敗、Table narrow / redacted / truncated、Code、Diff、Tree、KeyValue、Summary、長文を同じ State から Terminal / HTML で比較する。特に `run-group-mixed`、`table-narrow-long-redacted`、`code-diff` で、状態の独立性・密度・欠落の有無を確かめる。Phase 5 では renderer、scenario、PNG を変更しない。

## What we intentionally do not copy

Linear の issue / project shell、navigation、icon と brand、Vercel の dashboard layout、Geist font / palette / component API、Beautiful UI の loader、chip、card、Agent Screen、chat / approval flow をコピーしない。Approval は Presentation と並列の interaction capability である。Thinking を新 Domain State にせず、内部推論の開示を UI から要求しない。Phase 4 diagnostic renderer と v1 product preview の色・線・配置も基準にしない。

## Decisions deferred to Phase 6

具体的な HEX / ANSI palette、contrast 検証値、font family と CJK fallback / license、font size、spacing scale、radius、border / shadow、symbol / icon set、progress visual、spinner frame、motion duration / easing、responsive breakpoint、各 component の CSS と Terminal layout を決める。Phase 6 ではこの原則を token と component specification に写し、Phase 7/8 の実装前に Catalog の全主要状態で検証する。

## Open questions

- 長時間実行で同時 active Task が多いとき、Terminal の限られた行に何件を固定表示し、残りをどう持続的に示すか。Phase 7 で実 TTY と non-TTY を比較する。
- HTML report と live view で disclosure の初期状態をどう変えるか。Phase 8 で keyboard / screen reader と大量データを確認する。
- progress 更新と streaming output の motion / announcement の頻度をどこまで抑えるか。Phase 6 の specification 後、Phase 7/8 で実負荷と可読性を検証する。
- font と色の候補が Terminal user theme、CJK、Web 配布と contrast を満たすか。Phase 6 で候補ごとに確認する。
