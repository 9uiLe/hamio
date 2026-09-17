# セキュリティ方針

hamio は利用側スクリプトの入力と表示を担当する。入力検証、端末出力、秘密値、配布・導入、同梱ランタイムと製品依存をセキュリティ上の保守対象とする。製品の防御と信頼条件は[基本設計](docs/design.md#8-セキュリティ設計)、公開物の検証と更新は[配布手順](docs/distribution.md)に定める。

## 非公開の報告

脆弱性の疑いは [GitHub の非公開報告窓口](https://github.com/9uiLe/hamio/security/advisories/new)から所有者へ報告する。公開の PR・コメントに悪用手順や秘密情報を投稿しない。

報告には製品版、OS・CPU、再現に必要な最小入力、期待する動作、実際の動作、想定する影響を含める。認証情報、実業務の入力、個人情報は除き、ダミーデータを使う。報告のために第三者のシステムへアクセスしない。

所有者は再現、影響範囲、修正・回避策を調査し、報告スレッドで連絡する。公開時期は報告者と調整する。対応時間の保証は設けない。

## 対象と更新

サポート対象は最新の公開製品版とする。過去版への修正のバックポートは保証しない。利用者は完全な版を固定し、修正版の内容と証明を確認して明示的に更新する。

hamio は利用側コードの sandbox ではない。業務処理、起動元の環境変数、実行権限、回答 stdout の保管・ログ・転送は利用側が管理する。

## 依存とランタイムの確認

Dependabot が作成する Bun ecosystem の依存、GitHub Actions、Nix の更新 PR は、取得元、差分、lifecycle scripts、lockfile、検査結果をレビューして採用する。自動マージは行わない。

`bun audit` は npm 依存の監査であり、同梱 Bun 内部の native 部品を網羅しない。公開前および Bun 更新時は [Bun の advisory](https://github.com/oven-sh/bun/security/advisories)、[リリース情報](https://github.com/oven-sh/bun/releases)、固定ソースの native 依存と許諾を別途確認する。対象 revision、確認日、結果、確認できない範囲を[リリース評価](docs/release-readiness.md)と根拠資料へ記録する。

## 保守者の対応

1. 影響する製品版、OS、API、同梱部品を特定する。調査のログへ機密入力を残さない。
2. 必要に応じて非公開の advisory で修正を調整する。依存の advisory、修正差分、取得元、lifecycle scripts、lockfile を確認する。
3. 固定 Nix 環境で検査する。ランタイム・配布の修正では、3対象で候補の再現性と動作を検証する。
4. `package.json` の製品版を上げ、[配布手順](docs/distribution.md#保守者のリリース工程)に従って新しい immutable release を公開する。過去のタグ・資産は置換しない。
5. 影響版、修正版、回避策を advisory とリリースノートに記載する。導入試験に失敗した版は推奨を止め、修正版または検証済みの過去版への移行を案内する。
