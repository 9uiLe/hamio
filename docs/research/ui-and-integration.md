# UI と言語間連携の技術資料

確認日: 2026-09-17。対象は、複数言語の開発用スクリプトへターミナル UI を提供するための外部仕様と参照事例である。hamio の採用方針は [基本設計](../design.md) に定める。本書の外部製品の機能は、hamio の動作確認結果を意味しない。

## 独立 UI コマンドと UI 共通化の事例

[Gum](https://github.com/charmbracelet/gum) は、入力、選択、確認、表、装飾を独立コマンドとして提供する。入力結果を stdout で受け取る利用例があり、スクリプトの実装言語と UI の実装を分離できることを示している。

`9uiLe/wts` は、TypeScript の共通関数で表示と対話をまとめる参照事例である。以下の記述は commit `ac7daf4e828849dff3a9b1ddae4bc7ad68dccc83` を対象とする。

| 参照ファイル                                                                                                    | 確認できる構成                                         |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| [package.json](https://github.com/9uiLe/wts/blob/ac7daf4e828849dff3a9b1ddae4bc7ad68dccc83/package.json)         | Clack、Chalk、Ora、Commander を直接依存として固定する  |
| [src/ui.ts](https://github.com/9uiLe/wts/blob/ac7daf4e828849dff3a9b1ddae4bc7ad68dccc83/src/ui.ts)               | 成功、警告、失敗、詳細、処理中表示を共通関数にまとめる |
| [src/terminal.ts](https://github.com/9uiLe/wts/blob/ac7daf4e828849dff3a9b1ddae4bc7ad68dccc83/src/terminal.ts)   | TTY、CI、TERM、色に関する環境変数で表示を切り替える    |
| [src/prompts.ts](https://github.com/9uiLe/wts/blob/ac7daf4e828849dff3a9b1ddae4bc7ad68dccc83/src/prompts.ts)     | 非対話環境の検出とキャンセルを扱う                     |
| [scripts/build.ts](https://github.com/9uiLe/wts/blob/ac7daf4e828849dff3a9b1ddae4bc7ad68dccc83/scripts/build.ts) | Bun compile で macOS arm64 向け実行ファイルを生成する  |

wts は同一 TypeScript プロセス内の関数で UI を利用する。独立実行ファイルへまとめるだけでは、別言語から同じ関数を直接呼び出せるようにはならない。hamio では表示共通化の考え方を参照し、言語間のデータ契約を別に設ける。

Gum との比較では端末部品の有無だけでなく、入力・結果・エラーの契約、人と機械での意味の一致、利用側の連携負担を代表用途で評価する。wts の一つのビルド対象を、hamio の対応 OS 全体の動作根拠にはしない。

## UI 基盤

| ライブラリ                                            | 公式に提供する機能                                                          | hamio で確認する点                                                          |
| ----------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [Clack](https://bomb.sh/docs/clack/packages/prompts/) | 入力、選択、確認、秘密入力、進捗、カスタム入出力ストリーム、AbortController | フォームの内部アダプターに採用する。固定版1.8.1を使い、公開契約から変換する |
| [Ink](https://github.com/vadimdemedes/ink)            | React を使う対話型 CLI の構築                                               | 複雑な常時表示画面の比較対象。API v1 の製品依存には含めない                 |
| [Gum](https://github.com/charmbracelet/gum)           | スクリプトから呼べる UI コマンド                                            | 利用方法と連携負担を比較する既存製品                                        |

日本語幅、IME、emoji、画面幅変更、画面読み上げ、端末の入力モード復旧、Bun 同梱での動作は、選定した版と実機の組み合わせで検証する。機能一覧への記載だけで、すべての端末環境への適合を判断しない。

## JSON による公開契約

[RFC 8259](https://datatracker.ietf.org/doc/html/rfc8259) は JSON のデータ交換形式を定義する。hamio は入力定義、回答、状態、結果、エラーを JSON で渡し、特定言語の関数、例外インスタンス、クラスを公開境界に含めない。

項目 ID と選択肢の値は表示ラベルから分離する。大きな整数、日時、バイト列は [API v1](../api.md) で定める文字列表現を使う。JSON の構文が正しいことと、hamio の契約を満たすことは別に検証する。

[JSON Schema 2020-12](https://json-schema.org/draft/2020-12) はデータの構造と制約を記述する仕様であり、画面部品や配置の仕様ではない。hamio は専用の閉じたフォーム定義を使い、汎用 JSON Schema の評価と外部参照の取得を提供しない。項目制約と表示情報は公開契約で区別する。

[JSON-RPC 2.0](https://www.jsonrpc.org/specification) は要求 ID、応答、通知、エラーを定義する。一方、メッセージの区切り、キャンセル、認証、再接続、互換版の交渉は別に設計が必要になる。hamio の初期契約は単発フォームと進捗ストリームを対象とし、汎用の双方向セッションを要求しない。

## 端末と機械出力

[CLI Guidelines](https://clig.dev/) は機械向け JSON、対話と非対話の分離、stdout/stderr の使い分けを推奨する。[Node.js の TTY 文書](https://nodejs.org/api/tty.html) はストリームごとの端末判定を説明する。[NO_COLOR](https://no-color.org/) は色出力を抑える慣習であり、対話やすべての端末制御を止める指定ではない。

これらの仕様から、対話の可否、出力形式、装飾の可否は別の設定として扱う。AI エージェントが端末を利用する場合もあるため、TTY の有無だけでは機械モードを確定しない。

| 利用場面       | 入力経路                                           | 出力経路                                                   |
| -------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| 人向けフォーム | 明示した入力定義と、端末のキー入力を別経路で受ける | 端末 UI は stderr、回答 JSON は呼び出し元が捕捉する stdout |
| 非対話フォーム | 入力定義と事前指定の値                             | 検証済み回答、不足項目、エラー                             |
| 単発表示       | 型と意味を指定した結果データ                       | 人向け表示または機械向け JSON                              |
| 連続表示       | stdin の event 列                                  | 集約した端末表示または必要な状態変化                       |

stdout が pipe でも、stdin と stderr が端末ならフォームは対話し得る。進捗表示の stdin が pipe であることも正常である。各ストリームの役割を個別に判定し、同じ stdin を JSON とキー入力に同時使用しない。

呼び出し元は hamio の必要な出力を継続して読み、中断と終了状態を扱う。[Node.js の子プロセス文書](https://nodejs.org/api/child_process.html) は pipe の容量による停止と、Shell 経由・直接起動の違いを説明している。具体的な呼び出し方法は各言語と OS で検証する。

JSON 化だけでは token 削減を保証できない。キーの反復、進捗の再送、巨大なスキーマにも token が必要になる。stdout と stderr を合わせて、実際のエージェントの取得方式・tokenizer で成功、失敗、不足入力、大量出力を比較する。

## 表示データと秘密情報

[XTerm 制御シーケンス](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html) には、画面、タイトル、選択領域などを操作する命令がある。色用の SGR の除去だけでは、外部文字列に含まれる端末操作を排除できない。

hamio ではタイトル、ラベル、表セル、ログ、ファイル名を表示データとして扱い、外部の制御文字を文脈に応じて無害化する。機械出力の JSON エスケープと、端末向けの無害化は別の処理にする。

秘密値は利用側が項目として指定する。表示マスクに加え、復唱、エラー、ログ、永続化、回答の返却経路を管理する。呼び出し元へ渡す値には秘密が残るため、マスクを暗号化や sandbox の保証として扱わない。

単純な機構、最小権限、安全側の既定値という設計原則は [Saltzer & Schroeder, The Protection of Information in Computer Systems (1975)](https://web.mit.edu/Saltzer/www/publications/protection/) を参照する。具体的な保持量、検証、失敗規則は hamio の公開契約として定める。
