# ADR 0001 — Presentation State を Static / Live / Replay の共通入力にする

Status: Accepted for Phase 1 design, 2026-10-02.

## Context

現行の `Block[]` は単発表示、`Session.snapshot()` は端末の一行進捗を目的としており、完了 Task の詳細を保持しない。[Phase 0 監査](../current-state.md)のとおり、これらを HTML report や replay にそのまま転用すると同じ実行の意味が媒体ごとに異なる。Task pending、indeterminate progress、cancelled、失敗の理由も表しづらい。hamio は利用側の業務 event を観測するのではなく、利用側が提示すると宣言した事実を扱う。

## Decision

- `PresentationState` を renderer の唯一の意味入力にする。静的資料は State を直接定義し、live と replay は同じ reducer が Presentation Event を State に変える。[Domain 仕様](../domain-model.md)。
- Event は `run.started`、`task.declared`、`task.started`、`task.progressed`、`task.finished`、`content.published`、`run.finished` などの**過去に宣言された提示事実**とする。仕事を実行する命令や DOM/ANSI 操作は含めない。
- Result は `succeeded` / `failed` / `cancelled` の union とし、failed には Failure を必須にする。Task/Run の結果は利用側の宣言を保持し、Task 集計から Run 結果を推測しない。
- Replay は受理済み event を seq 順に同じ reducer へ渡す。clock や renderer 固有情報を reducer へ渡さない。partial / invalid は Recording の状態であり、Run の失敗や cancellation に変換しない。
- 完了 Task と content の意味は State に残す。保持量は明示的な上限で管理し、黙って古い事実を消さない。

## Alternatives considered

1. `Block` を共通化して live 結果を block へ逐次変換する案は、Task の状態と event の因果を失うため採らない。
2. Event のみを renderer に渡す案は、静的資料に人工的な event を要求し、Terminal と HTML が別々に state machine を実装するため採らない。
3. 動画・ANSI/DOM frame を記録する案は、媒体と幅に依存し、別 renderer での意味再生に使えないため採らない。必要なら Terminal の操作確認として別の capture を残す。

## Consequences

Renderer は State の投影・表現に集中できる。Recorder と live は同じ遷移規則を共有する。Task の保持にメモリ負荷が生じるため、Phase 2/3 で上限と利用側負荷を測る。v1 の event と Result は破壊的に変更される。UI の実際の見た目は Design Input Gate 後に決める。

この判断は意味の単一表現と状態の正確性を優先する（[ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html)、[Meyer 1992](https://doi.org/10.1109/2.161279)）。
