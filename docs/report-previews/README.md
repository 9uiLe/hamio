# HTML Report の代表ブラウザ確認

`failed.png` は Phase 10 の production HTML Report を macOS の Chrome 154 で開いた 640 × 900 の Light 表示である。`sh examples/presentation-live.sh ./dist/hamio failed --record run.ndjson` → `./dist/hamio presentation report --input run.ndjson --output run.html` の native executable 経路を使用した。Screenshot はブラウザの `prefers-color-scheme: light` を emulation して取得した。

Recording status `complete`、Run / Task の `failed`、Failure code と message、warning がそれぞれ読めることを確認するための代表画像であり、全 scenario の pixel snapshot gate ではない。file 形式・復旧・HTML の意味検査は[Recording 形式](../presentation-recording.md)と自動テストを正本とする。既存の `docs/previews/` は v1 product preview、`docs/catalog-previews/` は v2 renderer Catalog の確認で、責務は別である。
