# Phase 3 — Core / Protocol foundation の実装境界

[Phase 1 の Domain 仕様](domain-model.md)と [Target Architecture](target-architecture.md)を実装した範囲を記録する。現行 CLI の [API v1](https://github.com/9uiLe/hamio/blob/v0.1.0/docs/api.md) はこの Phase では変更しない。v2 はまだ公開 CLI/API へ接続していないため、二つの経路の並存は移行中だけの状態である。

| 責務                        | 実装                           | 境界                                                                                           |
| --------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------- |
| 意味型、State、Result、Item | `src/presentation/model.ts`    | 輸送・媒体・環境を import しない                                                               |
| Static State の意味検証     | `src/presentation/validate.ts` | ID 一意性、group、終端、進捗、table 等の関係を確認する                                         |
| Live reducer                | `src/presentation/session.ts`  | seq と検索 index を private に保ち、Event の受理後だけ State を更新する。snapshot は複製を渡す |
| Replay                      | `src/presentation/replay.ts`   | 同じ Session に accepted Event を順に渡す。complete/partial/invalid は Run Result と別に返す   |
| JSON/NDJSON ingress         | `src/protocol/decode.ts`       | UTF-8、JSON、版、閉じた shape、基本型・資源上限を確認して Domain Event/State へ写す            |

Static decoder は protocol shape を確認した後、Domain の `validateState` を一度呼ぶ。Live と replay は `PresentationSession.accept` を一つの遷移実装として使う。Protocol に Task の遷移規則を複製しない。Protocol の失敗は `ProtocolError`、Domain の不正状態・遷移は `PresentationError` であり、利用側が宣言する `Result.failed(Failure)` とは異なる。renderer、Form、CLI v2 の結線、Catalog はまだ存在しない。

## Phase 3 の資源方針

| 境界                                              | 暫定上限                  | 理由                                                                                                             |
| ------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 静的 JSON / Phase 3 の一括 NDJSON replay          | 256 KiB                   | v1 の document 上限を維持。一括読込みの foundation であり、Phase 10 の永続記録サイズではない                     |
| 一 event frame                                    | 64 KiB                    | v1 の frame 上限を維持                                                                                           |
| JSON 深さ / node / 文字列                         | 16 / 20,000 / 4,096 bytes | v1 の未信頼入力境界を維持                                                                                        |
| State の task / active task / semantic item       | 10,000 / 100 / 10,000     | v1 の task 上限を維持し、完了 Task を保持する新 State に item 上限を設ける。root と group 内の Task を共に数える |
| table columns / rows                              | 16 / 200                  | v1 の表上限を維持                                                                                                |
| tree depth / nodes、structured data depth / nodes | 16 / 20,000、16 / 20,000  | v1 の深さ・node の規模を直接構築する State にも適用                                                              |

この値は新しい表示要件の性能保証ではない。Phase 3 では Event を保存せず逐次 reduction できるため、live Event の総数に任意の小さい上限を置かない。seq は safe integer の範囲で連続とする。Recording の長期保持・event 数・trailer・crash recovery は Phase 10 の設計検証に残す。上限に達した Event は拒否し、完了 Task や content を黙って消さない。

`replayNdjson` の `complete` / `partial` 引数は、Phase 3 では**呼出側が持つ記録の完結性情報**である。永続 header/trailer を解析した証明ではない。`run.finished` が受理済みでも `partial` なら Run Result を保持したまま記録を partial と返す。壊れた frame と不正遷移は受理済み prefix と位置を返し、Run の失敗や cancellation を捏造しない。

## Preview と次段への引継ぎ

v2 module は既存 CLI から import されないため、v1 の製品 preview の生成元には含めない。`scripts/preview/artifacts.ts` の source hash は現行 CLI とその依存 module に限定する。生成元の選択だけを変更し、UI の意匠は変更しない。Phase 4 で renderer と共通 scenario を追加したら、それぞれの依存元を preview / Catalog 検証へ明示的に登録する。

Phase 4 は State と accepted Event 列を scenario にできる。HTML と Terminal renderer はこの State を読むだけで、Event の状態機械を持たない。v2 の public API、durable recording、配布単位、具体的な視覚表現は後続 Phase の判断である。
