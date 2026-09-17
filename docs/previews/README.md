# ターミナル UI のプレビュー

このディレクトリには、実際の疑似端末出力を固定したフォントと端末サイズで描画した PNG を置きます。PR とチャットで日本語、余白、色、カーソル更新を確認するための資料です。生成と共有のコマンドは[開発手順](../development.md#8-ターミナル-ui-のプレビュー)を参照してください。

## 製品 CLI: product

80列・28行の端末で製品の `form`、`stream`、`render` を実行します。環境の選択、確認入力、進捗更新、秘密値の非表示、結果表をダミーデータで確認します。シナリオ内で実際のデプロイや外部接続は行いません。

![製品の入力画面](product-input.png)

![製品の結果画面](product-result.png)

## 録画基盤: fixture

80列・20行の端末で録画基盤の検証用プログラムを実行します。日本語と選択肢を表示し、Enter に応じて進捗と結果表を出力します。製品 API の確認は product、記録と描画の基盤の確認は fixture が担当します。

![録画基盤の入力待ち](fixture-input.png)

![録画基盤の結果](fixture-result.png)

## 生成元と確認範囲

実行対象、入力、撮影位置は [scenarios.ts](../../scripts/preview/scenarios.ts)に定義します。`./scripts/preview.sh` は生成元と PNG の SHA-256 を [manifest.json](manifest.json) と照合し、不足・変更・破損があれば生成します。`--force` を指定すると必ず端末を再実行します。

操作途中は `./scripts/preview.sh --recording` で生成する `dist/preview/product.gif` と `dist/preview/fixture.gif` を確認します。録画はローカル専用の manifest で生成元、GIF、端末出力の記録を照合します。

内容の照合で更新漏れを検出し、画像と録画の目視で表示を確認します。各 OS の実端末、画面読み上げ、製品性能は専用の試験で評価します。
