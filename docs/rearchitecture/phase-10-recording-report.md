# Phase 10 — Recording / Replay / HTML Report 実装記録

[Phase 1 Domain/Recording 決定](domain-model.md#6-recording-と-replay)を [公開 Recording 形式](../presentation-recording.md)に落とし、Phase 9 `presentation` namespace に `live --record FILE` と `report --input FILE --output FILE` を追加した。`presentation replay` は Report と分類応答で同じ復元を確認できるため追加しない。公開 TypeScript SDK と live browser transport は Phase 9 の延期判断を維持する。

## 境界

`decodeEventLine → PresentationSession.accept → canonical encode → awaited Recording write → TerminalLiveView.update` の順。受理直後の書込み失敗では Session の accepted seq と file に書けた seq が異なり得るため、machine response は両方を区別し、失敗 Event の State を表示しない。Report は file を有界行で読み、同じ `PresentationSession` へ投入する。`ReplayResult` の complete / partial / invalid と Run Result は別。production HTML renderer の document composition に型付き Recording metadata を渡し、State に metadata を追加しない。Report は初期静止、JS・外部 resource なし。

記録用 internal encoder は Event variant を明示し、decode された既知 field のみ書く。raw stdin と rejected Event は保存しない。Writer は file を exclusive mode `0600` で開く。Report は同一 directory の一時 file を `0600` で書き、sync 後 hard link で final path を排他的に公開する。file の既存内容は上書きしない。追加 npm dependency、DB、compression、template engine、公開 SDK はなし。v1 form/render/stream/capabilities は変更しない。

## 耐久性・復旧

Format は `recordingVersion:1` の closed header/trailer と Protocol v2 Event 行。LF を一行の commit boundary とする。Graceful finish では trailer 後 `sync`。Event ごとの `fsync` はしていない。process crash 後、file に残った complete line まで復元可能だが、OS crash / power loss / filesystem corruption での保持は保証しない。未完了 final fragment と trailer 欠落は partial、途中の破損や count/seq 不一致は invalid で accepted prefix を返す。`run.finished` 後の trailer 欠落では Run の terminal Result を維持する。Recording 自体を Run failure/cancellation にしない。

## 実測と上限

macOS arm64、Bun 1.4.2、開発 shell、各条件単一 sample。storage はローカル filesystem、他 process の負荷は固定していない。

| 入力                  |   Event | Recording bytes | write + graceful sync | streaming replay | HTML生成 | 末尾 heap / RSS |
| --------------------- | ------: | --------------: | --------------------: | ---------------: | -------: | --------------: |
| 10,000 Progress       |  10,005 |       1,528,512 |                192 ms |            51 ms |   1.8 ms |   6.2 / 61.8 MB |
| 100,000 Progress      | 100,005 |      15,578,519 |              2,090 ms |           345 ms |  0.03 ms |   8.9 / 74.3 MB |
| 5,000 completed Tasks |  15,002 |       1,864,819 |                331 ms |            66 ms |   4.8 ms |  18.5 / 79.6 MB |

進捗 100,000 回の外挿約 312 MB、約 42 秒の awaited write で 2,000,000 Event に相当する。byte limit 512 MiB は大型 ContentItem の余地を含む上限で、Event 行は既存 64 KiB、metadata 行は 4 KiB。Reader は Event 履歴を保持せず State だけ保持する。上記 heap は読み終わり時点の値で peak memory ではない。5,000 Task の HTML は約 1.60 MB。任意の throughput 合格値は設けず、write の直列化と file/reader 上限を契約とする。

Phase 9 master を同じ pinned Bun runtime で別 root から compile した native executable は 62,292,978 bytes。Phase 10 は 62,326,002 bytes（+33,024 bytes）。HTML renderer を consumer binary へ含めても、runtime/source 読込みなしで `presentation report` を実行できた。release/package の在庫境界は既存 pipeline を維持する。

`release:verify` は別 root 2 回の native build と gzip/notice/SBOM hash 一致、展開後 executable の v1/native v2 tests を通した。生成した macOS arm64 gzip は 25,576,230 bytes。`nix flake check --all-systems --no-build --no-write-lock-file` は全対象の derivation 評価に成功したが、Linux binary の build/test 実行ではない。production npm graph に新規依存はなく、SBOM 対象の変更は hamio binary の source/hash だけである。

## 検証

同じ Event 列を live Session、native CLI Recording、streaming replay、production HTML Report へ通した。native executable と実 PTY で running/progress/completion、ファイルの header/Event/trailer を確認。Bun/Node の無い PATH から Report を生成。Chrome 154 / macOS で complete success/failure、partial running/terminal、CJK、redacted、長い Table/Code/Diff、360px/1200px、Light/Dark、forced colors を確認し、document 全体の横あふれ・script/network resource がないことを確認した。print PDF で `Recording incomplete` と `Run succeeded` が分離されることを確認した。代表画像は [HTML Report preview](../report-previews/README.md)。画面読み上げの再検証、Linux/browser 他版、実電源断・disk full は未検証である。

Phase 10 の自動テストは malformed header/trailer、incomplete final frame、mid-file corruption、Version、count/seq、duplicate trailer、Event after trailer、Run terminal との分離、public CLI、native PTY/clean runtime を対象とする。Phase 3 の Domain transition 自体は重複して試験しない。

## 品質レビュー

[ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html) の既存実装レビューとして、まず `package.json` / `tsconfig.json` / `.github/workflows/quality.yml` の品質資産を確認した。外部 quality gate artifact はなく、レビュー用 plugin に TypeScript profile はない。決定論の source は repository の `check`（Biome lint・format、TypeScript、142 tests、v1 preview、Catalog が成功）と Lizard の実測である。Lizard は `parse` CCN 40、`executePresentation` 42、Recording Reader 内の `processLine` 18。TypeScript に適用する事前閾値がないため **measured-only** とし、数値だけで pass/fail を宣言しない。07a 結合シグナルは未適用。

| 品質特性     | Phase 10 の判定根拠                                                                       |
| ------------ | ----------------------------------------------------------------------------------------- |
| 機能適合性   | live/record/replay/report の State 一致、partial terminal Run、invalid prefix tests       |
| 性能効率性   | 上記の直列 write / streaming replay と RSS 実測。多 OS の性能保証ではない                 |
| 互換性       | v1 contract tests、既存 v2 capability fields 維持、version 分離                           |
| 相互作用性   | Chrome の Light/Dark/狭幅/forced colors と印刷。新しい browser interaction はなし         |
| 信頼性       | line commit、trailer/count/seq、破損・中断時の分類と accepted prefix                      |
| セキュリティ | accepted Event のみ、closed metadata、表示値 escape、file `0600`、外部 resource なし      |
| 保守性       | Recording→Protocol/Domain、Report application→HTML の依存方向。CLI 境界の複雑度は監視対象 |
| 柔軟性       | 一 Run file と別 `recordingVersion`。DB/SDK/transport の拡張契約を先取りしない            |
| 安全性       | 業務成否を推測しない。物理的 hazard を扱う製品ではなく、誤報防止を確認                    |

設計境界を見直し、当初 `recording` 配下にあった Report file composition を `application` へ移動した。これにより Recording Reader/Writer は renderer を import せず、Report が State と Recording metadata を組み合わせる。Reader の中断と final file 未公開も確認した。High / Medium の未解決指摘はない。Low の維持課題は手書き CLI parser と command 実行関数の分岐数で、Phase 10 では parser framework を導入せず、引数・I/O 経路の public tests で保護する。Phase 11 で command がさらに増える場合に局所分割を検討する。
