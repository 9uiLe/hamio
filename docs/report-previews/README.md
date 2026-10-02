# HTML Report の代表ブラウザ確認

`failed.png` は Phase 10 の production HTML Report を macOS の Chrome 154 で開いた 640 × 900 の Light 表示である。`sh examples/presentation-live.sh ./dist/hamio failed --record run.ndjson` → `./dist/hamio presentation report --input run.ndjson --output run.html` の native executable 経路を使用した。Screenshot はブラウザの `prefers-color-scheme: light` を emulation して取得した。

Recording status `complete`、Run / Task の `failed`、Failure code と message、warning がそれぞれ読めることを確認するための代表画像であり、全 scenario の pixel snapshot gate ではない。file 形式・復旧・HTML の意味検査は[Recording 形式](../presentation-recording.md)と自動テストを正本とする。`docs/catalog-previews/` は Presentation renderer の共有 scenario による確認で、Report preview は記録から生成する HTML の確認である。

`partial-print.png` は Phase 12 の print 検証である。native executable で生成した `run.started` のみの partial Recording Report を Chrome 154 / macOS で開き、Dark preference の下で印刷 PDF を生成して画像化した。印刷では Light 背景になり、`Recording incomplete` と running Run が別の text として残る。画像は代表ページで、PDF そのものを配布物には含めない。
