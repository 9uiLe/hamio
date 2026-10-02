# Presentation Protocol v2 — CLI contract

hamio は利用側が宣言した Presentation の意味を Terminal へ表示する。業務処理、Task の再試行、Run の成否決定は利用側が行う。本書は native executable の `presentation` 入口を定める。[Form](interaction-form.md) は別の Interaction 契約であり、旧 Presentation v1 JSON をこの入口へ混ぜない。旧公開版からの変更は[移行ガイド](migration-v1-to-presentation-v2.md)を参照する。

## 入口と例

```sh
hamio presentation capabilities
hamio presentation static --input examples/presentation-static.json
sh examples/presentation-live.sh hamio succeeded
sh examples/presentation-live.sh hamio failed
sh examples/presentation-live.sh hamio succeeded --record run.ndjson
hamio presentation report --input run.ndjson --output run.html
```

`static` は `--input FILE|-`（省略時 stdin）から一つの UTF-8 JSON 文書を読み、既存 `decodeStatic` で検証する。文書は `{ "protocolVersion": 2, "state": { "run": ..., "items": [...] } }`。コピー可能な完全例は [`examples/presentation-static.json`](../examples/presentation-static.json) に置く。Run が未完でも静的 snapshot として表示でき、その場合の `runState` は `running` のままである。

`live` は stdin の UTF-8 NDJSON を読み、各行を既存 `decodeEventLine` で検証し、`PresentationSession.accept` に適用する。各 frame に `protocolVersion: 2`、`runId`、0 から連続する `seq`、`type` が必要である。[Shell の実行例](../examples/presentation-live.sh)は標準 shell と hamio だけで動き、seq を小さな `emit` 関数が付与する。例の script に ANSI、spinner、cursor 制御、端末幅計算はない。進捗がある Task と成功・失敗双方の Run Result を示す。任意言語から同じ JSON/NDJSON を送れるので、言語別 SDK は必要条件ではない。

`live --record FILE` は accepted Event を [Recording v1](presentation-recording.md) として、Terminal へ State を公開する前に追記する。既存 file は上書きしない。入力の未完了・不正・中断では、書込先が健全なら partial trailer を閉じる。Recording I/O が失敗した Event は新たに表示せず、`lastAcceptedSeq` と `lastRecordedSeq` を区別する。`report --input FILE --output FILE` は streaming replay の受理済み State を production HTML renderer に渡し、単一の self-contained HTML file を作る。出力 file は既存なら拒否し、途中の生成物を final path に公開しない。Report は complete / partial / invalid Recording のいずれからも生成でき、status と安全な issue location を Run Result と別枠で示す。

`presentation --help` は短い command 一覧を出す。`presentation capabilities` は現行 Presentation の発見入口で、`protocolVersion: 2`、製品版、`static` / `live`、Terminal と wire / state の上限を JSON で返す。Recording support、`recordingVersion: 1`、Recording 上限は additive field で返す。処理中に network、schema download、update check、telemetry、plugin lookup は行わない。

## 入出力と終了

人向け Terminal 表示は **stderr**、機械向け JSON 応答は **stdout** に分ける。TTY は表示 capability のみを決め、利用者が AI かどうかは推測しない。`--no-color` は ANSI 色を止め、`NO_COLOR` も尊重する。`--no-motion` は live の animation を止める。`TERM=dumb` または非 TTY では cursor 制御、animation、色を出さず、変更された意味行を安定した text として出す。非 TTY でも人向け表示を stderr に出すので、不要なら利用側がリダイレクトできる。

成功時は stdout に一行だけ返す。

```json
{
  "protocolVersion": 2,
  "status": "ok",
  "runId": "build",
  "runState": "succeeded",
  "lastAcceptedSeq": 6
}
```

`static` には `lastAcceptedSeq` がない。Run が存在しなければ `runId` / `runState` は `null`。`runState` は `running` / `succeeded` / `failed` / `cancelled` の表示対象の状態であり、`status: "ok"` は **hamio が表示操作を完了した**ことを示す。Run が `failed` でも表示が正常なら終了コードは 0。Task 集計から Run Result を推測しない。

Recording 付き live の正常応答には `recording: { recordingVersion, status, eventCount, lastRecordedSeq }`、失敗時には `recording.writeStatus` が付く。`writeStatus: "not_created"` は file 作成前の障害、`"partial"` は partial trailer の書込みと sync 成功、`"complete"` は complete trailer 後の Terminal / machine I/O 障害、`"unverified"` は Recording I/O 障害で file を再読込しなければ確定できないことを示す。`eventCount` と `lastRecordedSeq` は成功した Event 行 write の数値であり、電源断後の永続性を保証しない。`report` の正常応答は `status: "ok"`、`recording.status: complete|partial|invalid`、`runState` を**独立**に返す。invalid Recording でも accepted prefix の inspection report が生成できれば exit 0。`recording.issue` は line と安定した code のみで raw line を含まない。

失敗時は可能なら次の一行を返す。説明文の完全一致ではなく `error.code` で分岐する。説明文には raw input、secret、stack trace を含めない。stdout 自体が書けないときは応答の配送を保証せず終了コード 7 とする。

```json
{
  "protocolVersion": 2,
  "status": "error",
  "error": { "code": "INVALID_TRANSITION", "message": "Task has not been declared." },
  "accepted": { "runId": "build", "lastAcceptedSeq": 2 }
}
```

`accepted` は一つ以上の Event が受理済みのときだけ付く小さな診断情報で、State 全体を複製しない。不正 Event は受理されず、受理済み prefix を `failed` / `cancelled` に書き換えない。Run 完了前の EOF は `INCOMPLETE_STREAM`。SIGINT / SIGTERM による process 中断は `INTERRUPTED` であり、利用側が宣言した `run.finished(cancelled)` ではない。`run.finished` 後の Event も拒否する。

| 終了コード | error.code                                                                                 | 意味                                     |
| ---------: | ------------------------------------------------------------------------------------------ | ---------------------------------------- |
|          0 | なし                                                                                       | hamio の表示操作成功。業務 Result とは別 |
|          2 | `INVALID_ARGUMENT`, `INVALID_UTF8`, `INVALID_JSON`, `UNSUPPORTED_VERSION`, `INVALID_SHAPE` | 引数または wire 契約の不正               |
|          5 | `INVALID_STATE`, `INVALID_TRANSITION`, `INCOMPLETE_STREAM`                                 | State 関係・Event 順序・未完了 EOF       |
|          6 | `LIMIT_EXCEEDED`                                                                           | wire または Domain の上限超過            |
|          7 | `IO_ERROR`, `RENDER_ERROR`                                                                 | 入出力または表示処理の障害               |
|        130 | `INTERRUPTED`                                                                              | hamio process の中断                     |

## 検証・安全性

JSON shape、UTF-8、版、byte / depth / node / string 上限は Protocol ingress が確認する。Run ownership、seq、ID 再利用、状態遷移、Progress 単調性と active Task 上限は Phase 3 Domain が確認する。`presentation capabilities` が現在の具体的な上限を返す。live の各 Event は受理順を保ち、表示更新だけが coalesce される。遅い出力先への write は await し、表示待ちを無制限に積まない。

秘密を含む自由文、Failure message、Result data を宣言しない責任は利用側にある。Recording と HTML Report はその text を後から再表示できるため、保存前の確認が必要である。KeyValue / Table には `{"kind":"redacted"}` を渡し、秘密値そのものを State に渡さない。hamio は自由文から秘密を推測しない。Terminal renderer は制御文字を無害化し、表示上の色は意味の唯一の手段にしない。

## TypeScript と HTML の位置付け

この段階の stable cross-language surface は **native CLI + Protocol v2**。root package は `private: true` であり、`src/` import は公開 SDK ではない。TypeScript の high-level authoring API は prototype で評価したが、SDK 配布、version pin、exports、release、SBOM、利用側 install を伴うため今回公開しない。raw NDJSON の seq / ID は wire 契約に残る。将来 high-level API を作るなら、seq ownership を内部化し、同じ `PresentationSession` を使用する。

`renderHtml(PresentationState)` は内部 renderer foundation であり、Report file の保存は上記 public CLI が担当する。live browser transport は今回も追加していない。TypeScript SDK の公開も引き続き deferred とする。
