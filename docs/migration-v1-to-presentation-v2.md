# v0.1.0 API v1 から現行 Presentation への移行

公開済み [v0.1.0](https://github.com/9uiLe/hamio/releases/tag/v0.1.0) の `render` / `stream` / root `capabilities` は、Phase 11 以降のソースと次の配布候補から削除した。v0.1.0 tag と[当時の契約全文](https://github.com/9uiLe/hamio/blob/v0.1.0/docs/api.md)は変更しない。新入口は `hamio presentation ...` であり、v1 JSON を受け取る互換変換や旧 command alias はない。利用側で入力を Presentation Protocol v2 に書き換える必要がある。Form は独立した Interaction capability として維持し、`hamio form` の schema・応答 `apiVersion: 1` は変えない。[現行 Form 契約](interaction-form.md)。

## CLI と入出力

| v0.1.0                      | 現行                                     | 変更点                                                                                             |
| --------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `hamio render --input FILE` | `hamio presentation static --input FILE` | `blocks` ではなく v2 `state` を受け取る                                                            |
| `hamio stream`              | `hamio presentation live`                | v2 NDJSON Event。受理済み State を表示                                                             |
| `hamio stream --events`     | `hamio presentation live --record FILE`  | stdout の全 Event 応答ではなく、受理済み Event の durable file。用途が違うので一対一の置換ではない |
| `hamio capabilities`        | `hamio presentation capabilities`        | Presentation v2 の version・機能・上限を照会。root の v1 JSON は削除                               |
| `hamio form`                | `hamio form`                             | 独立した対話。schema と応答は `apiVersion: 1` のまま                                               |

Presentation の人向け出力は stderr、machine response は stdout に一行 JSON。TTY は色・redraw capability を決めるが、AI/人の識別には使わない。非 TTY と `TERM=dumb` は ANSI・cursor motion のない安定したテキストを stderr に出す。`NO_COLOR` / `--no-color` は色、`--no-motion` は live animation を止める。Form の `--interactive` と `--color` は別制御。業務 Run の失敗は hamio の処理失敗と異なるため、成功して表示できた場合の exit は0になり得る。live の未完了 EOF は Run `cancelled` ではない。Recording の complete/partial/invalid も Run Result とは別。[Presentation の終了コードと応答](presentation-api.md)を参照する。

## モデルと Event の対応

| v0.1.0                                                   | 現行                                                         | 移行で判断する意味                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `Block[]` / `DisplayDefinition`                          | `PresentationState.items` の semantic Item                   | 平坦な UI 部品を名前だけ変えない。Run/Task/Content の意味を指定する |
| `Result.success: boolean` と optional `message` / `data` | discriminated `Result`、`Failure`、`DataPresence`            | `none` と `value(null)` は異なる                                    |
| `error` Block                                            | `Failure`、`Message.error`、failed `Result` のうち本来の意味 | エラー通知だけでは lifecycle failure にならない                     |
| `run.start`                                              | `run.started`                                                | Run を明示して開始                                                  |
| `task.start`                                             | `task.declared` → `task.started`                             | pending Task を独立に表す                                           |
| `task.progress`                                          | `task.progressed`                                            | `none` / `indeterminate` / `determinate` を区別                     |
| `task.finish`                                            | `task.finished(Result)`                                      | succeeded / failed / cancelled を明示                               |
| `message`                                                | `content.published(Message)`                                 | severity は Run/Task Result を変更しない                            |
| `run.finish`                                             | `run.finished(Result)`                                       | Run Result を Task 集計から推測しない                               |

v2 の `seq` は受理順、`runId` は一 Run の所有を表す。進捗が 100% でも Task が `succeeded` とは限らない。redacted cell は秘密値を含めず、Renderer で後からマスクしない。Task の近くにある ContentItem がその Task に属すると推測しない。[Domain Model](rearchitecture/domain-model.md)と[公開 v2 wire 契約](presentation-api.md)を正本とする。

## コピー可能な入口

```sh
hamio presentation static --input examples/presentation-static.json
sh examples/presentation-live.sh hamio succeeded
sh examples/presentation-live.sh hamio succeeded --record run.ndjson
hamio presentation report --input run.ndjson --output run.html
```

live の Script は自分で業務結果を決め、v2 Event を送る。Terminal の ANSI、spinner、cursor 制御は書かない。accepted Event Recording は raw stdin の複製ではない。既存 file は上書きせず、trailer 不在は `partial` として replay する。HTML Report は同じ reducer で復元した State を表示する。[Recording 形式](presentation-recording.md)を参照する。
