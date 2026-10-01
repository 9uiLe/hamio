# ADR 0003 — Presentation v2 の公開入口

Status: **accepted for Phase 9**。

## Context

Phase 3 の Domain / Protocol、Phase 7/8 の production renderer は存在するが、consumer artifact は単一 native executable で、root package は private。`render` / `stream` / `capabilities` は API v1 の公開契約である。TypeScript の `src/` import を public SDK と呼ぶには install、version、exports、release、SBOM、Nix 配置の契約が欠ける。

## Consumer surface の比較

| 利用側               | 実際の接続                                                   | seq / ID / JSON                                  | ANSI / spinner              | 業務結果・障害                                 |
| -------------------- | ------------------------------------------------------------ | ------------------------------------------------ | --------------------------- | ---------------------------------------------- |
| Shell / 任意言語     | native `presentation static` または `live` へ JSON/NDJSON    | wire では必要。Shell 例の `emit` は seq を付ける | hamio が担当                | 利用側が Result、hamio が process error を返す |
| TypeScript           | Bun subprocess から同じ CLI。または内部 high-level prototype | CLI では wire が必要。prototype は seq を隠せる  | hamio が担当                | explicit `finish(result)` が必要               |
| AI が生成する script | versioned JSON と短い command を生成                         | stable schema を直接指定。曖昧な推測は不要       | hamio が担当                | error.code と終了コードで分岐                  |
| CI / 非 TTY          | stdin pipe、stdout JSON、stderr text                         | 同上                                             | ANSI / motion なし          | Presentation failed でも正常表示なら exit 0    |
| ローカル TTY         | 同じ CLI、stderr の capability で描画                        | 同上                                             | production TerminalLiveView | Business Result を自動推論しない               |

実行した Shell 例は 32 行（7 Event、成功／失敗両経路、引数検証、seq 付与、待機を含む）。Event 宣言は7行、manual Task ID は1個、manual seq 値は0個、UI 制御コードは0行。raw Protocol を直接使えば seq は利用側が管理する。32行の TypeScript high-level prototype を `dist/phase9-review/` で実行し、`PresentationSession` を使えば caller から seq を隠せることを確認した。一方で型安全な authoring、wire encode、背圧、install、version 管理まで製品として完結するには追加の配布設計が必要である。prototype は ignored development artifact であり public API ではない。

試作した caller 側の中心部分は次の形だった（公開 API の宣言ではない）。

```ts
const run = new Run("build");
run.start("Build project");
const task = run.task("compile", "Compile sources");
task.progress(1, 2);
task.finish({ kind: "succeeded", data: { kind: "none" } });
run.finish({ kind: "succeeded", data: { kind: "none" } });
```

## Decision

- **CLI-first**。`hamio presentation static|live|capabilities` を v2 の明示的 namespace にする。v1 command の意味と v1 capability JSON は変更しない。`v2` は wire version に残し、CLI 名に埋め込まない。
- static は既存 `decodeStatic`、live は既存 `decodeEventLine` + `PresentationSession` + Phase 7 `TerminalLiveView` を使用する。Event は一つずつ受理し、表示用 snapshot は入力 read batch ごとにまとめる。Event の受理を coalesce しない。
- v1 の bounded input reader と deadline 付き Output は I/O infrastructure として再利用する。v1 の Block / Session / wire model は v2 Domain へ渡さず、入口で I/O error を v2 machine code へ写す。
- stderr に human representation、stdout に一つの versioned machine response。`status: ok` と `runState: failed` は共存できる。invalid prefix、EOF、signal は Run Result へ変換しない。error.code は固定語彙、説明文には入力を復唱しない。
- Protocol v2 encoder と public TypeScript package は今回は追加しない。CLI 入力は既存 decoder が正本であり、未配布の encoder を public と誤認させない。TypeScript SDK を公開する Phase では encode/decode round trip と配布・release 全体を同時に扱う。
- `command -- ...` subprocess wrapper は child 出力、signal、PTY、secret、exit code の責務が大きいので追加しない。Form は別 capability のまま。
- HTML は今回 public export / live transport を追加しない。consumer の主な Phase 9 課題は native Terminal への接続であり、durable Recording と Report workflow は後続 Phase で扱う。live browser transport の必要性もその consumer use case で再評価する。

## Consequences

任意言語から追加 SDK なしで同じ v2 CLI を使え、v1 と schema を混ぜない。低水準 NDJSON の seq / ID は残るため、非常に長い live script の ergonomics は今後の課題である。公開 TypeScript SDK を急造しないことで、独立配布や release 設定の半端な約束を避ける。外部 dependency、network、plugin、generic hook は追加しない。

macOS arm64 / Bun 1.4.2 で 1,006 Event（Progress 1,001 回、150,503 input bytes）の producer + pipe + process 終了を各10回測った中央値は、`/bin/cat` baseline 約 2.90 ms、native hamio v2 `live --no-motion` 約 30.31 ms。hamio の stdout / stderr は 98 / 92 bytes、観測された `maxRSS` は約 36.0 MB。これは同じ転送量の軽量 process との比較であり、JSON validation・Domain reduction・Terminal 表示という処理の差を含む。長期の memory 安定性や他 OS の性能を証明する値ではない。表示 snapshot は read batch ごとに集約するが、Event 自体はすべて受理して順序を検証する。
