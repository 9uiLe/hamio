# Phase 7 — Terminal Renderer 実装確認

[Presentation Domain](domain-model.md) の `PresentationState` を [Design Direction](../design/direction.md)、[Tokens](../design/tokens.md)、[Components](../design/components.md) に従って Terminal へ描画する。v1 CLI / Terminal は現行製品のため残し、v2 の public CLI/API はまだ定めない。Phase 4 の `terminal-diagnostic.ts` は削除し、Catalog と PTY capture は `src/renderers/terminal.ts` を使う。HTML は Phase 8 まで diagnostic のままである。

## Representation と I/O

`terminal.ts` は State と明示した列数・色・animation phase から、制御文字を無害化した行、必要な ANSI 前景色、静的 text を決定的に生成する。Domain event、時計、環境変数、業務処理を読まない。`terminal-live.ts` は同じ行を使い、cursor・書込み・coalescing・spinner phase だけを所有する。環境 policy は開発 runner で一度決める。`NO_COLOR` は非空で色を無効にし、animation 設定とは独立させる。`TERM=dumb` と non-TTY は色・cursor・animation を使わない。

代表 spinner は **Run 行**に置く。複数 active Task から「選択中」を推測すると Domain にない優先順位を作るためである。Task 行は `running` と Progress を固定文字で示す。終了状態と警告・失敗は持続する行になる。40 列の Table は各 row を列名・値の組として表示し、80 列で収まる場合は列比較を優先する。可視文字列 cell は JSON の引用符を付け、数値・null・空文字・redacted と区別する。ContentItem は root の順序に置き、Task の子に見せかけない。Run Result は履歴の末尾にも置いて再発見しやすくする。

通常の TTY では変化した所有行だけを再描画し、出力中に一度に保留する書込みは一件、最新 snapshot だけを保持する。spinner frame は 250 ms 以上、data-driven repaint は 100 ms 以上空ける。最終 snapshot は close 時に書き切る。cursor は隠さず、全画面消去もしない。resize 後は端末の reflow で旧物理行数が不確かになるため、旧行を消さず新幅の snapshot を追加する。frame が viewport の行数に届く場合も cursor-up をやめて変更行を追記し、scrolled-out の caller 出力を消さない。この場合 continuous spinner は停止し、`running` の文字は残る。non-TTY は同じ変更行追記で、cursor control と ANSI を出さない。表示都合で State から Task を削除しない。

制御文字は既存 `safeText` と `Bun.stringWidth` / `Intl.Segmenter` を再利用し、sanitization → wrapping → ANSI styling の順にする。Renderer が生成した ANSI は幅計算に入れない。40 列の実 PTY 画像では録画 font fallback の emoji 幅が `Bun.stringWidth` と異なり、行末の結合文字が押し出された。そこで表示幅の右側に 4 列を確保し、再撮影で意図しない自動折り返しが消えたことを確認した。新規依存はない。既存 `@clack/core` は v1 Form 用のままで、この Renderer へ流用しない。

## 検証条件

`catalog:check` は全 Shared Scenario の 40/80 列を検査し、実 PTY で TTY × 色 × animation の 4 条件、終端・失敗・indeterminate・狭い/redacted Table・日本語/CJK・live 完了、および non-TTY を確認する。日本語/CJK は両 renderer 共通の `content-cjk` scenario に追加し、Terminal 専用 fixture は作らない。`tests/terminal-renderer.test.ts` は representation と live I/O 固有の検査を行う。Domain の遷移規則は再試験しない。代表3 PNG は production Terminal renderer の静的出力から既存 PTY capture 基盤で生成し、画像として確認する。live 完了も一時 cast から最終 frame を画像化して確認し、redraw の残骸がないことを見た。一時 cast / GIF / PNG は `dist/` のみで追跡しない。v1 の4 PNG は `scripts/preview/capture.ts` の追加環境入力によって source hash が変わったため再生成し、v1 の見た目が維持されたことを別途確認した。

macOS / Apple Silicon、Bun 1.4.2、Nix preview shell で確認した。Quality CI の Linux PTY と 40/80 列での検査は PR の check 結果を正本とする。外部の多様な Terminal emulator と user theme の色対比は今回網羅しないため、色は常に補助とする。

## 性能観察

手元の macOS / Apple Silicon、Bun 1.4.2、開発用 TypeScript 実行で、各測定を他の benchmark と並行せず実施した。これは v1 製品実行ファイルとの比較ではない。`task-running-partial` を 40/80 列でそれぞれ 200 回描画した中央値は約 0.024 / 0.019 ms、出力は 66 / 77 bytes。1,000 完了 Task、50 active Task、200 行の Table を含む State を 40/80 列でそれぞれ 30 回描画した中央値は約 18.7 / 19.2 ms、出力は約 51 / 52 KiB。100 件の Progress snapshot を約 10 ms 間隔で与えた約 1.1 秒の live 測定では 12 writes、752 bytes、通常の repaint 間隔は最短約 100 ms（close の最終 flush を除く）。タイマーは終端後に停止し、保留 write は直列化する。短時間の heap 使用量差分は GC に左右されたため、長期 memory leak の数値的証明とはしない。性能のための Task 省略や別の意味 index は加えていない。

## 残る境界

Phase 8 は同じ State を HTML に描画する。Phase 9 で公開 CLI/API と環境設定の形を決めるまで `terminal-runner.ts` は開発専用である。v1 の visual 実装を v2 に移していない。v1 との統合・削除は移行 Phase に残す。
