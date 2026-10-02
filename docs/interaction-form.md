# Form Interaction 契約

Form は Presentation と並列の対話 capability である。`hamio form` の JSON は引き続き `apiVersion: 1` を使用するが、旧 `render` / `stream` の Block や Event とは共有 model を持たない。Presentation の入口は [Presentation API](presentation-api.md) を参照する。公開済み v0.1.0 の全 API v1 契約は [release tag](https://github.com/9uiLe/hamio/blob/v0.1.0/docs/api.md) に保存されている。

```text
hamio form --definition FILE [--values FILE|-] [--interactive auto|always|never] [--color auto|always|never]
```

定義は実ファイルを要求し、`--values -` は stdin を使う非対話の指定である。未知・重複 option を拒否し、秘密値を CLI 引数で受け取らない。人向け対話表示は stderr、機械応答は stdout の一行 JSON。TTY は capability 判定であり利用者が人か AI かの判定には使わない。

- `auto`（既定）は stdin と stderr が TTY、`TERM` が `dumb` 以外、`CI` が空、`--values -` でない場合に質問する。
- `always` は端末を要求し、`--values -` と併用できない。`never` は提供値と default だけで検証する。
- 色の既定は stderr TTY、`TERM`、`NO_COLOR` に従う。`--color always|never` は明示制御で、色と対話の有無は独立する。

入力は UTF-8 JSON。未知 property と version は拒否する。ID は `[A-Za-z0-9][A-Za-z0-9_.-]{0,63}`、`__proto__` / `prototype` / `constructor` は予約する。階層16、20,000 node、文字列4,096 UTF-8 bytes、定義/値文書256 KiB、項目64、選択肢100を上限とする。対話の一質問の入力16 KiB、出力待ち256 KiB、書込み期限5秒。秘密入力は画面でマスクするが、成功応答には実値を返す。利用側が stdout の保管・ログ・転送を管理する。

| exit | status           | 意味                            |
| ---: | ---------------- | ------------------------------- |
|    0 | `ok`             | 回答を取得                      |
|    2 | `error`          | 引数、JSON、version、定義が不正 |
|    3 | `needs_input`    | 必須項目が不足                  |
|    4 | `invalid_values` | 提供値が不正                    |
|    6 | `error`          | 上限超過                        |
|    7 | `error`          | 入出力・UI 障害                 |
|  130 | `cancelled`      | SIGINT/SIGTERM、Ctrl-C、EOF     |

`error` には安定した `error.code` を含める。値・秘密・stack は message に含めない。取消時に部分回答を返さない。

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
