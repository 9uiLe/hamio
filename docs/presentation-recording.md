# Presentation Recording v1

Recording は一つの Run について、**受理された Presentation Event** を後から同じ `PresentationSession` で復元するための公開 file format である。Run の業務結果と Recording の完結性は独立している。`Recording=partial, Run=succeeded` は正当である。[CLI の入口](presentation-api.md)と [Domain の意味](rearchitecture/domain-model.md)を参照する。

## Framing と closed shape

UTF-8 NDJSON。各 frame は一つの JSON object と終端 LF (`\n`) で構成する。LF まで書かれた行だけを復元する。最終行に LF がなければ JSON として正しく見えても **incomplete final frame** として捨てる。CRLF、空行、未知 field、未知 version は受理しない。行の順序は次のとおり。

```jsonl
{"recordingVersion":1,"protocolVersion":2,"kind":"header"}
{"protocolVersion":2,"runId":"build","seq":0,"type":"run.started","title":"Build"}
{"protocolVersion":2,"runId":"build","seq":1,"type":"run.finished","result":{"kind":"succeeded","data":{"kind":"none"}}}
{"recordingVersion":1,"kind":"trailer","status":"complete","eventCount":2,"lastSeq":1}
```

Header は一つで、Run ID を確定しない。最初の `run.started` が Run ownership を確定する。Header に username、hostname、cwd、環境、時刻、Terminal 幅等を自動収集しない。Event 行は [Protocol v2](presentation-api.md) の既知 shape だけを canonical encoding する。raw stdin と拒否 Event は保存しない。Trailer は一つで、`status` は `complete` または `partial`、`eventCount` は受理済み行数、`lastSeq` は最後の seq、Event が0件なら `null`。`invalid` は Writer の trailer status ではなく Reader の分類である。`complete` trailer は `run.finished` 行の書込み後のみ有効である。

`recordingVersion` と Event の `protocolVersion` は別の version。未知 version を best-effort で解釈しない。Event 順序は seq が決め、wall clock は入れない。Recording に ANSI、cursor、spinner、画面幅、theme、HTML を保存しない。

## Recovery と分類

| 入力                                                                            | 分類           | 復元                                             |
| ------------------------------------------------------------------------------- | -------------- | ------------------------------------------------ |
| 空 file、header が不完全                                                        | invalid        | 空の accepted prefix と issue                    |
| header だけ                                                                     | partial        | 空の State                                       |
| header + valid Event prefix、trailer なし                                       | partial        | accepted prefix                                  |
| 最後の frame に LF がない                                                       | partial        | 最終 fragment を捨て、先行 prefix                |
| `run.finished` 後に trailer なし                                                | partial        | terminal Run Result を保持                       |
| valid partial / complete trailer                                                | trailer に従う | count/seq と complete の Run 終了を検証          |
| 途中の JSON/Protocol/transition の破損、trailer 不一致・重複、trailer 後の byte | invalid        | その位置で停止し、accepted prefix と行番号・code |

Reader は file stream を有界 line ごとに読み、同じ `PresentationSession` へ Event を渡す。途中の破損を探し直して後続を勝手に受理しない。invalid raw line は Report や machine response に埋め込まない。Report は accepted prefix の State を表示し、Recording status と安全な issue location を別枠で付ける。partial/invalid を Run `failed` / `cancelled` に変換しない。

## Limits と耐久性

| 対象             |                上限 |
| ---------------- | ------------------: |
| Recording 全体   |             512 MiB |
| accepted Event   |           2,000,000 |
| Event JSON 行    | 64 KiB（LF を除く） |
| header / trailer |               4 KiB |

長期上限は一括 static document の 256 KiB とは独立。macOS arm64 / Bun 1.4.2 での単一 sample は、100,005 Event の進捗 Run が 15,578,519 bytes、書込み約 2.11 s、streaming replay 約 0.34 s。5,000 Task / 15,002 Event は約 1.86 MB。2,000,000 Event は 100,000 更新の20倍で、10 Hz の継続更新なら約55.6時間に相当する。512 MiB は測定した進捗行の外挿約312 MiBに、大きな item の余地を足した上限である。Event 行の最大 64 KiB が続けば byte limit が先に効く。AI Agent、build/test、migration、repository analysis の長期実行を一つの file で扱いつつ、無制限の disk 使用を防ぐ。上限到達は `LIMIT_EXCEEDED` として停止し、表示だけ継続する silent degradation はしない。ここでの測定値は他 OS や電源断での保証ではない。

Writer は Event ごとの write を await し、complete JSON 行と LF の書込み後だけ Live Renderer に State を公開する。書込み失敗時はその Event の State を新たに表示しない。成功した Event 行数と最後の seq を machine response へ別に返す。通常終了では trailer の後に file sync する。Event ごとの fsync はしない。**保証は process crash 後に file に残った完全な行まで復元できること**であり、OS crash、power loss、filesystem corruption の耐久・真正性は保証しない。checksum や署名による改ざん検証はない。

Recording file は exclusive create、macOS/Linux では mode `0600` を要求する。既存 file を上書きしない。Report は同じ directory の一時 file を完全に write/sync し、hard link で final path を排他的に公開して一時 file を削除する。final path に半端な Report を残さず、既存 file や symlink を上書きしない。file mode は OS・filesystem による制約を受ける。

## Privacy と将来の互換性

Table / KeyValue の `redacted` は秘密値自体を持たない。自由文、Code、Diff、Failure message、Result data に秘密を含めない責任は producer にある。hamio は自由文の secret を自動検出・除去しない。Recording/Report は長期保存・転送され得るため、producer は表示許可済みの意味だけを送る。Report は self-contained な production HTML で、remote resource・script・telemetry を必要としない。

新しい header / trailer field や frame type は新しい recordingVersion を必要とする。将来の reader が旧版を読む場合も、版ごとの明示的 decode を用い、未知 field を黙って無視しない。
