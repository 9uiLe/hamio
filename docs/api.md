# hamio API v1

hamio は、スクリプトの入力フォームと表示を担当するターミナル UI ツールである。本書は利用側のプログラムが共有する CLI、JSON、終了状態、資源上限を定める。業務の実行、権限、並列数、再試行は利用側が管理する。

API v1 の通信はローカルのプロセス I/O で行う。製品 API に接続するためのサーバー、認証トークン、言語別 SDK は必要ない。実行ファイルの導入と更新は[配布手順](distribution.md)、責務は[基本設計](design.md)、内部構成は[実装設計](implementation.md)を参照する。接続例は [Shell](../examples/form.sh) と [Python](../examples/form.py) に用意する。

## コマンドと入出力

```text
hamio form --definition FILE [--values FILE|-] [--interactive auto|always|never] [--color auto|always|never]
hamio render [--input FILE|-] [--format human|json] [--color auto|always|never]
hamio stream [--format human|json] [--events] [--color auto|always|never]
hamio capabilities [--section forms|display|stream|limits|all]
hamio --help
hamio --version
```

| コマンド       | 入力                                         | stdout                                        | stderr                       |
| -------------- | -------------------------------------------- | --------------------------------------------- | ---------------------------- |
| `form`         | 定義ファイル、任意の提供値、対話時のキー入力 | 回答、不足、無効値、キャンセル、エラーの JSON | 対話画面                     |
| `render`       | 表示定義。既定は stdin                       | 成功応答。JSON 形式では表示データも含む       | human 形式の表示             |
| `stream`       | stdin の改行区切り JSON                      | 最終応答。`--events` 指定時は各 event も返す  | human 形式の進捗・通知・結果 |
| `capabilities` | なし                                         | 対応契約・機能・上限の JSON                   | なし                         |

`FILE` の `-` は stdin を表す。ただし `--definition` は実ファイルを必須とし、対話のキー入力と定義の読み取りを共有しない。`--values -` は非対話専用である。ファイル入力にもサイズ上限を適用する。

CLI オプションは `--名前 値` の形式とし、未知・重複のオプションを拒否する。秘密値を直接 CLI 引数へ渡すオプションは設けない。`--help` は `-h` でも指定でき、単独指定で使い方を返す。`--version` は実装版を返す。この二つ以外の stdout は JSON とする。

### 対話、形式、色

TTY は標準入出力が接続する端末を指す。接続先から既定動作を決めるために使い、人と AI エージェントの識別には使わない。

| 設定                        | 規則                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `form --interactive auto`   | 既定値。stdin と stderr が TTY、`TERM` が `dumb` 以外、`CI` が未設定または空、`--values -` でない場合に対話する |
| `form --interactive always` | stdin と stderr の TTY、`TERM` が `dumb` 以外であることを要求する。`--values -` との併用はエラー                |
| `form --interactive never`  | 対話せず、提供値と既定値を検証して回答または不足を返す                                                          |
| `render / stream --format`  | 明示指定を優先する。省略時は stderr が TTY なら `human`、それ以外は `json`                                      |
| `--color auto`              | 既定値。stderr が TTY、`TERM` が `dumb` 以外、`NO_COLOR` が未設定または空の場合に色を使う                       |
| `--color always / never`    | 色の有効・無効を明示する。always は `NO_COLOR` より優先する                                                     |

フォームの回答は対話時も JSON であり、stdout を利用側で捕捉できる。`never` は色を止める設定で、対話フォームのカーソル操作は止めない。機械利用では `form --interactive never` または `render / stream --format json` を指定する。このとき stderr は空とし、stdout に診断や端末装飾を混ぜない。`/dev/tty` は暗黙に開かない。

## 共通データと互換性

公開契約版は整数 `apiVersion: 1` で表し、実装版と独立して管理する。要求の未知の版・キーを拒否する。応答への任意項目追加は互換変更とし、利用側は未知の応答項目を無視する。既存の意味、必須条件、終了状態を変える場合は新しい契約版を使う。

JSON は UTF-8 とし、単一応答は改行で終える。文字列は有効な Unicode、数値は有限な IEEE 754 値、整数は安全な整数範囲とする。大きな整数は10進文字列、日時はタイムゾーン付き RFC 3339 文字列、バイト列は Base64 文字列に利用側で符号化する。hamio はこれらを通常の文字列として扱い、自動的な型変換はしない。

利用側は重複キーを送らない。`__proto__`、`prototype`、`constructor` は全階層のオブジェクトキーと ID で予約する。ID の形式は `[A-Za-z0-9][A-Za-z0-9_.-]{0,63}` とする。フォームの項目 ID はフォーム内、表の列 ID は表内で一意とする。task ID は同じ run 内で再利用しない。

## 終了状態とエラー

終了コードは UI 操作の状態を表す。業務の成功・失敗は利用側が `result.success` などの値で判断する。

| 終了コード | status           | 意味                                             |
| ---------- | ---------------- | ------------------------------------------------ |
| 0          | `ok`             | UI 操作を完了した                                |
| 2          | `error`          | CLI、JSON、契約版、要求定義が不正                |
| 3          | `needs_input`    | 非対話で必須回答が不足                           |
| 4          | `invalid_values` | 提供値の型、選択肢、制約が不正                   |
| 5          | `error`          | event の順序・状態遷移違反、完了前の EOF         |
| 6          | `error`          | サイズ、件数などの上限超過                       |
| 7          | `error`          | ファイル、入力、出力、内部 UI の障害             |
| 130        | `cancelled`      | SIGINT、SIGTERM、対話中の Ctrl-C・EOF による中断 |

`capabilities` は契約情報を直接返し、`status` を持たない。`--help` と `--version` も正常時は終了コード0とする。

エラー応答の形式は次のとおり。

```json
{
  "apiVersion": 1,
  "status": "error",
  "error": { "code": "INVALID_REQUEST", "message": "Input does not match the API contract." }
}
```

| error.code            | 終了コード | 対象                                     |
| --------------------- | ---------- | ---------------------------------------- |
| `INVALID_ARGUMENT`    | 2          | コマンド、オプション、モードの組み合わせ |
| `INVALID_JSON`        | 2          | JSON の構文                              |
| `UNSUPPORTED_VERSION` | 2          | 契約版                                   |
| `INVALID_REQUEST`     | 2          | 要求の型、キー、項目制約                 |
| `PROTOCOL_ERROR`      | 5          | 連続表示の順序、状態、EOF                |
| `LIMIT_EXCEEDED`      | 6          | 入力・保持量の上限                       |
| `IO_ERROR`            | 7          | ファイル・標準入出力の読み書き           |
| `UI_ERROR`            | 7          | 内部 UI の障害                           |

利用側は `code` で分岐し、説明文の完全一致に依存しない。説明文には入力値、秘密、ファイル内容、内部 stack を含めない。書き込みは5秒で失敗させ、出力先が閉じた場合も終了コード7とする。出力障害では JSON 応答が配送できることを保証しない。

## フォーム

### 定義

フォームには `apiVersion`、`id`、`fields` を指定し、`title` は任意とする。`fields` は1件以上で、配列順を質問順とする。

```json
{
  "apiVersion": 1,
  "id": "deploy",
  "title": "デプロイ設定",
  "fields": [
    { "id": "name", "kind": "text", "label": "名前", "minLength": 1, "maxLength": 80 },
    {
      "id": "environment",
      "kind": "select",
      "label": "環境",
      "options": [
        { "value": "local", "label": "開発環境" },
        { "value": "staging", "label": "ステージング" }
      ]
    },
    { "id": "approved", "kind": "confirm", "label": "続行しますか？" },
    { "id": "token", "kind": "secret", "label": "トークン", "required": false }
  ]
}
```

全項目に `id`、`kind`、`label` を指定する。`description`、`required`、`default` は任意で、`required` の既定値は true。

| kind          | 回答の型 | 固有の定義と規則                                                                           |
| ------------- | -------- | ------------------------------------------------------------------------------------------ |
| `text`        | string   | `minLength` は既定0、`maxLength` は既定4,096。いずれも0〜4,096の整数で、最小値は最大値以下 |
| `secret`      | string   | text と同じ長さ制約。`default` は禁止し、入力をマスクする                                  |
| `confirm`     | boolean  | false も有効な回答。対話の初期選択は否定とする                                             |
| `select`      | string   | `options: [{value,label}]` を1件以上指定する。value は一意な文字列                         |
| `multiselect` | string[] | select と同じ options。回答の重複を拒否し、順序は入力順を保つ                              |

長さ制約は Unicode code point 数で判定し、共通の UTF-8 4,096 bytes上限も適用する。必須の text / secret は空文字、必須の multiselect は空配列を拒否する。正規表現、条件分岐、外部参照、任意関数は定義に含めない。

### 値の解決と質問

`--values` には項目 ID をキーとする JSON オブジェクトを渡す。明示された値、`default` の順に採用する。明示された null や無効値を既定値へ置き換えない。未知の項目 ID は無効値として扱う。

定義の `default` も項目制約を満たす必要があり、不正な既定値は要求定義のエラーとする。提供値が不正なら対話を開始せず `invalid_values` を返す。すべての提供値が有効な場合に、必須の不足項目だけを質問する。

任意項目が未提供で既定値もなければ、回答から省略し、対話でも質問しない。質問させたい項目は必須とする。任意項目に値を明示した場合は、空値でも型・長さ・選択肢の制約を適用する。

### 応答

| status           | 固有項目                               | 意味                                |
| ---------------- | -------------------------------------- | ----------------------------------- |
| `ok`             | `id`、`values`                         | 検証済みの回答                      |
| `needs_input`    | `id`、`missing: string[]`              | 不足する必須項目 ID。非対話時に返す |
| `invalid_values` | `id`、`issues: [{field,code,message}]` | 提供値の問題                        |
| `cancelled`      | なし                                   | 中断。部分回答を返さない            |

すべての応答に `apiVersion: 1` を含める。不足・無効値の応答にも部分回答を含めない。無効値と不足が同時に存在する場合は無効値を優先する。

```json
{
  "apiVersion": 1,
  "status": "ok",
  "id": "deploy",
  "values": { "name": "example", "environment": "local", "approved": false }
}
```

issue の code は `TYPE`、`REQUIRED`、`LENGTH`、`CHOICE`、`DUPLICATE`、`UNKNOWN_FIELD` とする。未知の項目は `field: ""` とし、未信頼のキーをエラーへ復唱しない。

秘密の実値は成功応答の `values` にだけ含める。利用側は stdout を捕捉し、保管・ログ・エージェント転送を管理する。確認の取得失敗を true に置き換えない。

## 単発表示

`render` は `{"apiVersion":1,"blocks":[...]}` を受け取る。`blocks` は0件以上の表示部品で、各部品を `kind` で識別する。

| kind        | 項目                                                               |
| ----------- | ------------------------------------------------------------------ |
| `message`   | `level`、`text`。level は `info` / `success` / `warning` / `error` |
| `key-value` | `items: [{label,value,secret?}]`                                   |
| `table`     | `columns: [{id,label,secret?}]`、`rows: [{columnId:value}]`        |
| `progress`  | `label`、`current`、`total`                                        |
| `result`    | `success: boolean`、任意の `message`、`data`                       |
| `error`     | ID 形式の `code`、`message`                                        |

値の一覧と表の value は string / number / boolean / null とする。表は1列以上で、各行に定義したすべての列を要求し、未知の列は拒否する。`result.data` は共通上限内の任意の JSON 値。progress は `0 <= current <= total`、total は正数とする。

human 形式では stderr に表示し、stdout に `{"apiVersion":1,"status":"ok"}` を返す。json 形式では同じ応答に `blocks` を含める。既定値の補完や秘密値の除去を行うため、要求オブジェクトの文字列表現そのものを返す契約ではない。

`secret` の既定値は false。true を指定した値または表の列は、両形式で `[redacted]` に置換する。自由文と `result.data` に秘密を含めない責務は利用側にある。

人向け表示では端末制御文字と双方向制御文字を無害化する。長い行は表示幅へ収め、表は20行まで表示し、省略行数を示す。機械出力の非秘密値は表示上の省略や無害化で変更しない。大量データのページ選択と取得は利用側で行う。

`result.success: false` や error 部品を正しく表示した場合も終了コードは0。hamio の処理失敗と表示対象の業務失敗を区別する。

## 連続表示

### フレームと状態

`stream` は stdin から NDJSON を読む。NDJSON は各行が一つの JSON オブジェクトになる形式である。空行は禁止し、CRLF と最後の行の改行省略は受け付ける。

一回の起動が扱う表示単位を run、その中で追跡する業務処理の単位を task、通知一件を event と呼ぶ。すべての event に `apiVersion: 1`、`runId`、`seq`、`type` を含める。

| type            | 固有項目                           | 適用条件と効果                                              |
| --------------- | ---------------------------------- | ----------------------------------------------------------- |
| `run.start`     | `title`                            | 最初の event。seq は0。run を開始する                       |
| `task.start`    | `taskId`、`label`                  | 未使用の task ID を活動中にする                             |
| `task.progress` | `taskId`、`current`、`total`       | 活動中 task の進捗を更新する                                |
| `task.finish`   | `taskId`、`status`                 | 活動中 task を終了する。status は `succeeded` / `failed`    |
| `message`       | `level`、`text`                    | 通知する。level は `info` / `success` / `warning` / `error` |
| `run.finish`    | `result: {success,message?,data?}` | 活動中 task がない場合に結果を確定する                      |

seq は run 全体で1ずつ増加する安全な整数とする。重複、欠番、runId の混在、二回目の開始、未開始・終了済み task の更新を拒否する。task ID は完了後も同じ run 内で再利用できない。

進捗は `0 <= current <= total`、total は正数。task 内で current は減らさず、total は変更しない。完了通知に進捗100%への到達は要求しない。

### 応答と終了

`run.finish` で最終応答を返し、EOF を待たずに入力処理を終了する。以後の event は受け付けない。送信側は書き込みの失敗と hamio の終了状態を処理する。`run.finish` 前の EOF は `PROTOCOL_ERROR` とする。

```json
{
  "apiVersion": 1,
  "status": "ok",
  "runId": "build",
  "result": { "success": true },
  "tasks": { "succeeded": 2, "failed": 0 },
  "warnings": []
}
```

`result` は利用側が確定した業務結果。`tasks` は終了した task の件数、`warnings` は warning / error 通知の `{level,text}` 配列とする。task の失敗件数から result.success を上書きしない。業務結果が false でも正常に表示できれば終了コード0とする。

json 形式の既定出力は最終応答一つ。`--events` は json 形式専用で、受け付けた各 event を `{"apiVersion":1,"type":"event","event":...}` として順に返し、最後に通常の応答を返す。通知の全量が必要な場合だけ指定する。途中で失敗した場合は既に返した event の後にエラー応答が続き、配送できなければ終了コードで失敗を示す。

### 人向け進捗と端末の占有

TTY では進捗を最新状態へ集約し、最大10 fpsで一行を更新する。状態が変わらなければ進捗用 timer を動かさない。非 TTY または `TERM=dumb` の human 形式では途中進捗を出さず、開始、通知、結果を出す。

同じ端末へ複数の描画プロセスを同時接続しない。フォームが必要な場合は task と run を終了してからフォームを起動し、回答後に新しい run を開始する。API v1 は同一 run の一時停止・再開を提供しない。

## 資源上限と機能照会

| 対象                              |         上限 |
| --------------------------------- | -----------: |
| 単発 JSON 文書                    |      256 KiB |
| NDJSON の1行                      |       64 KiB |
| JSON の階層 / ノード数            |  16 / 20,000 |
| 文字列の UTF-8 長                 |  4,096 bytes |
| フォーム項目 / 項目ごとの選択肢   |     64 / 100 |
| 表示 block                        |           32 |
| 表の列 / 行                       |     16 / 200 |
| key-value 部品ごとの項目数        |          200 |
| 同時活動中 task / run 全体の task | 100 / 10,000 |
| run 内の warning・error 保持合計  |          100 |
| 対話の1質問に送るキー入力         |       16 KiB |
| 対話描画の出力待ち行列            |      256 KiB |
| 出力の書き込み待機                |          5秒 |

JSON の深さはルートを0とし、ノード数にはオブジェクトのキーも数える。文書とストリームは逐次読み取りし、フレーム上限を超えた時点で失敗する。これらはアプリの入力・保持量の上限であり、OS のメモリ使用量を強制する制限ではない。

活動中 task の詳細は完了時に解放し、重複検出用の ID 集合と件数を保持する。全 event の履歴は保持しない。info / success 通知は最終応答へ蓄積せず、warning / error は上限まで保持し、超過時は明示的に失敗する。

`capabilities` の既定応答は次のとおり。`version` は実装版に対応する。

```json
{ "apiVersion": 1, "version": "0.1.0", "commands": ["form", "render", "stream", "capabilities"] }
```

`--section forms|display|stream|limits` は対応するキーを追加し、`all` はすべてを追加する。forms は入力種別、display は表示部品種別、stream は event 種別の配列、limits はプロトコル処理の上限オブジェクトとする。機能照会を含む通常の実行では、ネットワーク、利用側コード、外部 schema、プラグインを取得しない。
