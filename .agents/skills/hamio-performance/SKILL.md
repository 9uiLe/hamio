---
name: hamio-performance
description: hamio の起動、入力応答、メモリ、CPU、event 量、並列性の変更・性能調査で、利用側への負荷と測定条件を評価する。
---

# パフォーマンス

[性能予算](../../../docs/design.md#性能予算)から対象シナリオを選び、[測定手順](../../../docs/development.md#製品試験と性能測定)で条件と指標を揃える。

- 利用側の JSON 生成・転送・待機・補助プロセスを含め、同じ業務を hamio なし・ありで比較する。
- 表示更新を集約しても、受理した Event と Recording 書込み、失敗・警告を黙って捨てない。遅い受信先、長時間反復、中断、並列業務を変更した経路に応じて確認する。
- PresentationSession は完了 Task を State に保持する。Task 数・active Task 数の上限、Recording reader の streaming 復元を混同せずに測る。
- 業務の並列数は利用側に残し、UI のプロセス・Worker を event ごとに増やさない。導入案は生成・転送・終了の負荷まで比較する。
- 無期限待機、busy loop、非 TTY の animation を避ける。過去版の測定値を現行契約の低負荷の根拠にしない。

最適化は一条件ずつ比較し、改善と悪化を併記する。未測定値や通常の Lint・テスト成功を性能予算の達成として報告しない。予算変更には利用シナリオと根拠を残す。
