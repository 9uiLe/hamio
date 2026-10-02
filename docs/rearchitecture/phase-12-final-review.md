# Phase 12 — Final Product & Engineering Quality Review

対象は Phase 11 を取り込んだ master から作った 0.2.0 配布候補。Phase 0–11 の文書と公開済み [v0.1.0 評価](../release-readiness.md)は履歴として保持する。現行契約は [設計](../design.md)、[Presentation](../presentation-api.md)、[Recording](../presentation-recording.md)、[Form](../interaction-form.md)。新しい Domain component / Event / protocol、SDK、plugin、browser transport は追加していない。

## Architecture / responsibilities / coupling

| 境界                                    | 一文の責務                                                                                 | 主な依存方向                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `src/presentation`                      | 意味のある State、Event、検証、単一 `PresentationSession` を所有する                       | 媒体、wire、file、Form、CLI を知らない                                         |
| `src/protocol`                          | 不信な JSON/bytes を closed v2 shape として decode し、受理 Event を canonical encode する | Presentation semantics に依存。遷移を所有しない                                |
| `src/recording`                         | 一 Run の受理 Event を永続化し、有界 streaming reader で同じ Session へ戻す                | Protocol と Presentation に依存。Renderer を知らない                           |
| `src/renderers/terminal*`               | State を幅・色・motion policy に従う Terminal 表現へ変換し、live 出力を管理する            | Presentation と低レベル文字安全性に依存                                        |
| `src/renderers/html*`                   | State を escape 済み semantic HTML に変換し、Recording metadata は文書組立てで別表示する   | Presentation に依存。Terminal を知らない                                       |
| `src/application` / `src/cli.ts`        | public command の解析、I/O、Error と各機能の組立てを所有する                               | 下位境界を呼ぶ composition root                                                |
| `src/interaction`                       | Form の定義・回答検証・Terminal 入力を所有する                                             | Presentation model を import しない。`@clack/core` を対話 primitive として使う |
| `src/adapters` / `src/terminal/text.ts` | bounded input、awaited output、Terminal text safety を共用する                             | 意味 model を知らない                                                          |
| `scripts/catalog` / build・release      | 21共有 scenario の inspectability、配布物の再現・検証を担当する                            | 製品境界を組み立てる開発用コード                                               |

`src` 内の相対 import は修正前94本、修正後88本で、循環は0。修正後の Protocol→Presentation 4、Recording→Presentation 4/Protocol 5、Renderer→Presentation 4/Terminal safety 1 の方向を確認した。Terminal と HTML の相互 import、Interaction→Presentation import、Presentation→外側の import はない。`src/application/error.ts`、`io-limits.ts`、`metadata.ts`、`presentation-cli.ts`、`presentation-report.ts` はそれぞれ process error、I/O 上限、版/help、公開 Presentation 組立て、Report file の排他的公開を担当する。`src/terminal/text.ts` は Renderer と Form が共用する安全な表示文字列・幅処理として保持する。

**修正した High finding:** `src/presentation/replay.ts` が Recording complete/partial を解釈し、製品未使用の `replayNdjson` とともに Presentation/Protocol に Recording 分類を持ち込んでいた。分類を `src/recording/reader.ts` へ戻し、一括 replay helper と重複テストを削除した。Reader は引き続き `PresentationSession` を使用し、第二の reducer を持たない。Streaming reader の valid/partial/invalid、terminal Run、欠落 trailer、破損 prefix の既存テストが通る。

`presentation-cli.ts` の parser と実行分岐は大きい。計測上の CCN だけを理由に service/interface へ分割していない。accepted Event → awaited Recording write → State publish、終了時の trailer/Terminal/response cleanup が同一場所で追える利点があり、分割で重複する cleanup の方が現時点では危険。今後の command 追加時は局所分割を再評価する。

## Domain / explicit state / specification alignment

`StructuredValue` は有界 JSON 値、`DataPresence` は none/value(null を含む)、`Failure` は code/message/details、`Result` は succeeded/failed/cancelled の判別 union。`ProgressState` は none/indeterminate/determinate、Task は pending/running/Result、Run は running/Result、TaskGroup は group のみ。SourceExtent は complete/truncated、Cell は visible/redacted（redacted に value はない）。ContentItem は Task への所有関係を持たず、State.items の順序を Renderer・Catalog・Report が維持する。Recording は complete/partial/invalid を Run state と独立して返す。

Optional field の棚卸し: `Result.succeeded.message?` と `cancelled.reason?` は補足文、`Code.language?` と `Diff.source?` は metadata、`SourceExtent.truncated.omittedCount?` は省略数の追加情報であり、いずれも暗黙の lifecycle state ではない。Run の不在は explicit `none|present`。failed without Failure、success with Failure、determinate without total、redacted carrying value は型で排除し、負値/非有限数、重複 ID、seq 欠落、複数 Run、完了後 Event、complete Recording と unfinished Run の不整合は不信入力と時系列を扱うため runtime validation で排除する。

語彙を [Domain model](domain-model.md)、`model.ts`、Protocol v2、Terminal/HTML、Catalog、Recording/Report、CLI 応答で照合した。Task/Run/Progress/Message/Result/Failure/DataPresence/redacted/source truncation の意味は共通。Run Result は Task 集計から推測せず、Message.error と lifecycle Failure は別、Recording の完結性は Run outcome と別である。

## Public API / developer experience

公開 command は `presentation static`、`live`（任意 `--record`）、`report`、`capabilities`、独立した `form`、root `--help`/`--version`。v1 alias、compatibility-only mapper、public TS SDK、plugin/theme hook はない。Presentation は stderr 人向け表示と stdout の bounded JSON machine response を分け、operation status、Run state、Recording status、安定 error code を独立させる。SIGINT/EOF を Run cancellation と推測しない。Form は `apiVersion:1` を維持する。copyable Shell 例に ANSI/cursor/spinner/HTML はない。

**修正した High finding:** release candidate の independent-project smoke は Form だけを通し、現行 Presentation/Recording/Report の製品入口を確認していなかった。`scripts/smoke-consumer.sh` に Bun/Node のない PATH で capabilities、static、live+Recording、Report を追加した。Release 公開ノートが削除済み `docs/api.md` と v0.1.0 評価へリンクしていた点も現行 API と版別 readiness へ変更した。

**修正した High finding:** PR の Nix package jobs で、公開済み v0.1.0 を固定する derivation が、0.2.0 候補向けに拡張した `smoke-consumer.sh` を実行して失敗した。`nix/package.nix` の install check を固定資産の version/help 検証へ限定し、現行 Presentation/Recording/Report の independent-project smoke は Release candidate verification に置いた。未公開版の command を公開済み版へ要求しない境界にした。

## Tests / comments / simplification

| 分類                              | 現行ファイル                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------- |
| Domain unit                       | `presentation.test.ts`                                                            |
| Protocol                          | `protocol-v2.test.ts`                                                             |
| Renderer                          | `terminal-renderer.test.ts`, `html-renderer.test.ts`                              |
| Integration / public CLI          | `presentation-cli.test.ts`, `recording-cli.test.ts`, `executable.test.ts`         |
| Recording format / replay         | `recording.test.ts`                                                               |
| Interaction                       | `interaction.test.ts`                                                             |
| UI / Catalog                      | `catalog.test.ts` と `catalog:check`、実 PTY と browser 目視                      |
| Build / distribution / regression | `distribution.test.ts`, `release.test.ts`, `nix-release.test.ts`, `hooks.test.ts` |

`replayEvents` / `replayNdjson` の二つの一括 replay テストは streaming Recording と同じ不変条件を重複していたため削除。旧 v1 command 名の拒否テストは、現行 root help と未知 command のテストへ変更。Domain test に HTML、Protocol test に Recording 分類を持ち込まない。静的 clone 測定は `jscpd` の src+tests で3箇所/34行/0.494%、いずれも test CLI setup であり production clone はない。Lizard は `parse` CCN 40、`executePresentation` 42、`PresentationSession.accept` 38を測定したが、TypeScript に適用する事前閾値がないため measured-only。`terminal-live.ts` の class 全体を一関数 CCN 74 とする Lizard 結果は parser artefact として除外した。実装詳細だけを固定する追加 snapshot は作らない。

obsolete な v1/Phase3 由来の上限 comment 二つを削除し、repo skill 内の削除済み `docs/api.md` リンクと旧 `--events` / 完了 Task 解放前提を現行責務へ更新した。その他の production comment は局所的な why/constraint（cursor 所有、width margin、書込失敗、bounded scan など）で、全面削除の対象は見つからなかった。削除した abstraction は `ReplayResult`/`WireReplayResult`、一括 replay helper、余分な NDJSON line generator。Domain/Protocol/Recording の意味境界は維持した。

## Terminal / HTML / Catalog / accessibility

`catalog:check` は21共有 scenario を両 production renderer、40/80列、HTTP と代表 PTY capture で通した。Catalog を起動し、Chrome で mixed Run/Task、Task failure、CJK、狭い Dark Table、native binary の失敗 Report を目視。Task failure と独立 Run result、warning、redacted/null、source data を確認した。Terminal の non-TTY/cadence/resize/abort/cleanup は専用 tests、実 PTY の CLI/Recording/Form は executable/Interaction tests と実検証で確認する。継続 spinner の30秒観察では CPU 使用0.11秒、1 core 平均0.37%、出力5,518 bytes、終了後の正常応答を確認した。

**修正した Medium finding:** 360px forced-colors の Report で Run ID が running status に接して表示された。narrow container の ID を別行へ移し、実 Chrome で状態語と ID を分離確認。Dark preference 下の print PDF で暗い page background が残ったのは dark palette selector が print selector より強かったため。print 側で同じ specificity を持たせ、再生成 PDF の[代表ページ](../report-previews/partial-print.png)が Light で Recording status と Run state を保持することを画像で確認した。

Chrome 154.0.8037.93 / macOS 27.0 arm64 では Light/Dark、360/640/1200px、CJK、reduced motion、forced colors、200% CSS zoom 相当、Table scroll region を Tab で focus（2px outline）、印刷を確認。360px の product HTML は zoom 後も document 横幅360pxのまま、Table の overflow は名前付き・focus可能な region 内に残る。実 VoiceOver の発話は **NOT VERIFIED**。semantic HTML の検査を発話試験と同一視しない。macOS 以外の browser はローカル未検証。

## Security / supply chain / dependencies

Protocol は UTF-8、JSON、closed shape、深さ/件数/byte上限、reserved key と seq/状態を検証。Terminal text は制御・bidi を無害化し、その後に ANSI を適用する。HTML は任意 user HTML を受けず、escape、CSP、外部 script/font/image/telemetry なし。Recording は accepted canonical Event のみを `0600` / exclusive で書き、raw rejected input を保存しない。Report は同一 directory の一時 file を sync 後 hard link で排他的に公開する。自由文の秘密は producer が送信前に除去する責任であり、hamio が自動検出するとは主張しない。

新規 npm dependency なし。唯一の直接 production dependency `@clack/core@1.5.1` を保持する理由は [0.2.0 readiness](../release-readiness-v0.2.0.md)に記録。推移依存4 package、MIT、組織共通 security policy、lockfile・`--ignore-scripts` と `bun audit` を確認。Bun 1.4.2 の固定 revision、公開 advisory と release notes を確認したが、同梱 native 部品の完全な advisory/許諾 inventory は未確認。Actions は commit SHA 固定、Nix lock 固定、候補は SBOM/notices/attestation を生成・検証する。通常製品起動に network はない。

## Performance / distribution

macOS arm64、固定 Bun 1.4.2、native executable、PATH に Bun/Node なし、各小呼び出し35 sample。median / p95 は capabilities 22.4/23.31 ms、static 24.8/26.12 ms、Form 非対話 23.34/24.06 ms、短い live 25.24/26.33 ms。100,005 Event（100,000 Progress）の 15.28 MB 入力→15.28 MB Recording は2.49秒、最大 resident set 73.8 MB。streaming replay+HTML Report は0.36秒、最大 resident set 58.4 MB、Report 13,015 bytes。`/usr/bin/time -l` の maximum resident set であり JS heap ではない。30秒 idle spinner の測定は上記。各長時間条件は単一 sample で、他 OS の性能保証や p95 として扱わない。通常 Form PTY 入力 p95 50 ms target は実利用者の操作 latency を未測定。

0.2.0 source binary は macOS arm64 62,309,490 bytes（ビルド時点）。Nix は公開済み 0.1.0 を固定し、0.2.0 source build と混同しない。`check` は lint/format/typecheck/tests/Catalog、CI quality はこれに build と native capability を加える。hooks は staged 検査と pre-push の check を担い、release 候補は別の `release:verify` が独立二 build・SBOM/notices/機能を確認する。Release workflow の candidate smoke は今回現行 command へ拡張した。

macOS 27.0 arm64 の clean clone から `setup → check → build → release:verify` を実行し、追跡ファイルは変更されなかった。`--version` は 0.2.0、`presentation capabilities` は protocol 2 / recording 1 を返した。40列の実 PTY では Shell producer の running、`1/2` Progress、Failure、完了を ANSI とともに確認し、同時に complete Recording を生成した。Form の実 PTY は Interaction/native executable tests で確認した。`nix flake check --all-systems --no-build --no-write-lock-file` は全3対象の derivation を評価した。CI の [Release verify run 36948468392](https://github.com/9uiLe/hamio/actions/runs/36948468392) は source 実装 commit `24fe562256026b27fd39ea9f3905f4c3a2351235` に対し macOS 15、Ubuntu 24.04 x64 / arm64 の build、attestation、独立候補検証に成功した。ローカル macOS 27 と CI macOS 15 / Linux を同一の検証とは扱わない。

## ISO/IEC 25010:2023 観察と残課題

| 特性         | 検証根拠と限界                                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| 機能適合性   | 同じ Event の live/Recording/Replay/Report、116→114 tests、21 Catalog scenario。公開 command smoke を拡張 |
| 性能効率性   | 上記 absolute latency、100k Event、30秒 idle CPU。多 OS・操作感の保証ではない                             |
| 互換性       | v0.1.0 の破壊的変更を 0.2.0 と移行ガイドで明示。互換 wrapper なし                                         |
| 相互作用性   | Chrome の responsive/print/focus/forced colors。VoiceOver 発話は未検証                                    |
| 信頼性       | Streaming Recording の復旧、排他的 file、write-before-render、PTY cleanup tests                           |
| セキュリティ | 有界 ingress、escape、canonical Event、audit、公開 advisory 検査。未知脆弱性は保証外                      |
| 保守性       | 無循環依存と一文責務、Recording 分類の移動、一括 replay 削除。CLI 分岐は監視対象                          |
| 柔軟性       | 媒体・Interaction・Recording version が独立。未使用 extension point なし                                  |
| 安全性       | 物理 hazard のある製品ではない。業務 failure と操作・Recording failure の誤報防止を確認                   |

| Severity | Finding                                                                                        | 解決                                                           |
| -------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| High     | Recording 分類が Presentation/Protocol の未使用 replay helper に入り、依存方向を曖昧にしていた | Streaming Reader へ分類を移し、helper/重複 test を削除         |
| High     | Candidate consumer smoke が Form のみ、Release notes は削除済み API と旧評価へリンク           | current Presentation/Recording/Report smoke と現行 link へ修正 |
| Medium   | Dark preference の印刷が暗い背景を残し、narrow forced colors で Run ID が status に接した      | CSS selector と狭幅配置を修正、Chrome/印刷画像で再確認         |
| Low      | `presentation-cli.ts` の分岐複雑度、VoiceOver 発話、他 browser / OS のローカル確認             | 製品動作を守る test と CI を維持し、後続の検証課題として記録   |

Blocker / High の未解決 finding はない。公開判断は [0.2.0 readiness](../release-readiness-v0.2.0.md)に分離する。長期保守では CLI command 増加、Bun/native advisory、Form prompt dependency、長期 Recording の filesystem failure を監視する。
