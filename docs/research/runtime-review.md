# Bun 1.4.2 の公開前確認

確認日: 2026-09-17。対象は Bun 1.4.2、revision `744846f844374847c902b5e7fd59b4342a51ef99`。hamio の実行ファイルへ同梱するランタイムを対象とし、開発用ツールの監査と区別する。

## 脆弱性情報

- `bun audit` は46個の npm パッケージを検査し、既知の脆弱性を検出しなかった。これはインストール済み JavaScript 依存の検査である。
- [Bun の公開 advisory](https://github.com/oven-sh/bun/security/advisories)は確認時点で0件。[1.4.2 のリリース情報](https://bun.com/blog/bun-v1.4.2)の JavaScriptCore 更新、メモリリーク・クラッシュの修正を確認した。advisory がないことを脆弱性の不存在とは扱わない。
- 固定ソースの native 依存定義から21個の commit と Brotli 1.1.0 を抽出し、[OSV API](https://google.github.io/osv.dev/api/#osv-api)で照合した。22照会すべて返却された該当項目は0件。入力・結果・確認時刻は[生データ](runtime-review.json)に保存する。

OSV の commit 照会はデータベースの収録範囲に依存する。fork の commit、vendor された部品、OS 提供ライブラリ、polyfill、未公表の問題はこの照合で安全と判定できない。以下は上流ソースの取得先であり、配布 binary の全構成を逆解析した SBOM ではない。Windows 限定など hamio の対象外の定義も含む。

## native 依存の固定ソース

| 定義           | 上流の固定参照                                                                                                                             | 根拠                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| boringssl      | [`41bf9b59c2ebf277a7aa427e1ecad5cc80dd4d4f`](https://github.com/oven-sh/boringssl/tree/41bf9b59c2ebf277a7aa427e1ecad5cc80dd4d4f)           | [Bun の固定定義](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/scripts/build/deps/boringssl.ts)      |
| brotli         | [`v1.1.0`](https://github.com/google/brotli/tree/v1.1.0)                                                                                   | [Bun の固定定義](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/scripts/build/deps/brotli.ts)         |
| cares          | [`c7a3138dcfe3bb0eaaf10c0c24c36dc66dc790ab`](https://github.com/c-ares/c-ares/tree/c7a3138dcfe3bb0eaaf10c0c24c36dc66dc790ab)               | [Bun の固定定義](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/scripts/build/deps/cares.ts)          |
| hdrhistogram   | [`be60a9987ee48d0abf0d7b6a175bad8d6c1585d1`](https://github.com/HdrHistogram/HdrHistogram_c/tree/be60a9987ee48d0abf0d7b6a175bad8d6c1585d1) | [Bun の固定定義](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/scripts/build/deps/hdrhistogram.ts)   |
| highway        | [`2607d3b5b0113992fe84d3848859eae13b3b52c1`](https://github.com/google/highway/tree/2607d3b5b0113992fe84d3848859eae13b3b52c1)              | [Bun の固定定義](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/scripts/build/deps/highway.ts)        |
| libarchive     | [`ded82291ab41d5e355831b96b0e1ff49e24d8939`](https://github.com/libarchive/libarchive/tree/ded82291ab41d5e355831b96b0e1ff49e24d8939)       | [Bun の固定定義](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/scripts/build/deps/libarchive.ts)     |
| libdeflate     | [`c8c56a20f8f621e6a966b716b31f1dedab6a41e3`](https://github.com/ebiggers/libdeflate/tree/c8c56a20f8f621e6a966b716b31f1dedab6a41e3)         | [Bun の固定定義](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/scripts/build/deps/libdeflate.ts)     |
| libjpeg-turbo  | [`e352b02f794f701407b39af08576035ba3360d60`](https://github.com/libjpeg-turbo/libjpeg-turbo/tree/e352b02f794f701407b39af08576035ba3360d60) | [Bun の固定定義](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/scripts/build/deps/libjpeg-turbo.ts)  |
| libspng        | [`fb768002d4288590083a476af628e51c3f1d47cd`](https://github.com/randy408/libspng/tree/fb768002d4288590083a476af628e51c3f1d47cd)            | [Bun の固定定義](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/scripts/build/deps/libspng.ts)        |
| libuv          | [`8023581113b276e7c1aee3f82da57ca0893faab1`](https://github.com/oven-sh/libuv/tree/8023581113b276e7c1aee3f82da57ca0893faab1)               | [Bun の固定定義](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/scripts/build/deps/libuv.ts)          |
| libwebp        | [`b7e29b9d75bd31422b00c2a446d49d7af06c328d`](https://github.com/webmproject/libwebp/tree/b7e29b9d75bd31422b00c2a446d49d7af06c328d)         | [Bun の固定定義](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/scripts/build/deps/libwebp.ts)        |
| lolhtml        | [`725ce499aa9b71e38b7a2d0a9fbb6d7294a4079e`](https://github.com/oven-sh/lol-html/tree/725ce499aa9b71e38b7a2d0a9fbb6d7294a4079e)            | [Bun の固定定義](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/scripts/build/deps/lolhtml.ts)        |
| lshpack        | [`8905c024b6d052f083a3d11d0a169b3c2735c8a1`](https://github.com/litespeedtech/ls-hpack/tree/8905c024b6d052f083a3d11d0a169b3c2735c8a1)      | [Bun の固定定義](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/scripts/build/deps/lshpack.ts)        |
| lsqpack        | [`1e9c5b8e59f8161c54f168a570c8bfdc59ded0c3`](https://github.com/litespeedtech/ls-qpack/tree/1e9c5b8e59f8161c54f168a570c8bfdc59ded0c3)      | [Bun の固定定義](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/scripts/build/deps/lsqpack.ts)        |
| lsquic         | [`3181911301b1aa4f54c1ed690901abc674ee08fb`](https://github.com/litespeedtech/lsquic/tree/3181911301b1aa4f54c1ed690901abc674ee08fb)        | [Bun の固定定義](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/scripts/build/deps/lsquic.ts)         |
| mimalloc       | [`6a64e1ba7f5b2130d4efccb67ec87fd0003f0f6a`](https://github.com/oven-sh/mimalloc/tree/6a64e1ba7f5b2130d4efccb67ec87fd0003f0f6a)            | [Bun の固定定義](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/scripts/build/deps/mimalloc.ts)       |
| picohttpparser | [`066d2b1e9ab820703db0837a7255d92d30f0c9f5`](https://github.com/h2o/picohttpparser/tree/066d2b1e9ab820703db0837a7255d92d30f0c9f5)          | [Bun の固定定義](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/scripts/build/deps/picohttpparser.ts) |
| rust-argon2    | [`ed81866f163f0c7026aa6fd8388adf37242eb32a`](https://github.com/sru-systems/rust-argon2/tree/ed81866f163f0c7026aa6fd8388adf37242eb32a)     | [Bun の固定定義](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/scripts/build/deps/rust-argon2.ts)    |
| tinycc         | [`05f0fafaa3be31e31d7b4b5c17dc60f62c991171`](https://github.com/oven-sh/tinycc/tree/05f0fafaa3be31e31d7b4b5c17dc60f62c991171)              | [Bun の固定定義](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/scripts/build/deps/tinycc.ts)         |
| webkit         | [`2e2aa2290fac856d6f451ceacb58f7f5b44dd057`](https://github.com/oven-sh/WebKit/tree/2e2aa2290fac856d6f451ceacb58f7f5b44dd057)              | [Bun の固定定義](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/scripts/build/deps/webkit.ts)         |
| zlib           | [`12731092979c6d07f42da27da673a9f6c7b13586`](https://github.com/zlib-ng/zlib-ng/tree/12731092979c6d07f42da27da673a9f6c7b13586)             | [Bun の固定定義](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/scripts/build/deps/zlib.ts)           |
| zstd           | [`f8745da6ff1ad1e7bab384bd1f9d742439278e99`](https://github.com/facebook/zstd/tree/f8745da6ff1ad1e7bab384bd1f9d742439278e99)               | [Bun の固定定義](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/scripts/build/deps/zstd.ts)           |

SQLite や ICU などの vendor データ・WebKit 側の依存は [Bun の同じ revision](https://github.com/oven-sh/bun/tree/744846f844374847c902b5e7fd59b4342a51ef99)と上記 WebKit ソースを起点に追跡する。この表だけを完全な同梱一覧として配布しない。

## 許諾・通知・再リンク

[固定した Bun の LICENSE.md](https://github.com/oven-sh/bun/blob/744846f844374847c902b5e7fd59b4342a51ef99/LICENSE.md)を取得し、保存済み `scripts/release/bun-notices.txt` と byte 一致を確認した。SHA-256 は `b9caf52728691b4057e371232c221a132883198be2f3d2ddf92c90404c984b1a`。配布 pipeline はこの hash を検証し、hamio 本体と production npm 依存の許諾全文と一緒に notices へ梱包する。

上流は Bun 本体の MIT と、静的リンクする JavaScriptCore / WebCore の LGPL、TinyCC の LGPL、他の native 部品・polyfill の許諾を区別している。Bun 全体へ単一の MIT 表記を付けない。hamio のソースは製品タグで提供し、同じ lockfile と修正した Bun を使って実行ファイルを再生成できる。

再リンクは上流の固定 revision の手順を使う。Bun の固定ソースを取得し、`vendor/WebKit` を clone、`bun sync-webkit-source` で固定版を展開してから修正し、`bun run build:local` で再ビルドする。上流のビルドに必要な compiler・platform SDK は別途必要である。hamio 側は `HAMIO_BUN_RUNTIME=/absolute/path/to/rebuilt/bun bun scripts/build.ts` で生成する。公式 runtime revision を強制する `release:verify` と、利用者が修正 runtime を指定する `build` を区別する。

通知の参照先、ソースの取得先、再リンク方法を配布物と同じ版の文書から追跡可能に保つ。Bun や native 部品の更新ではこの確認をやり直す。上流の WebKit 全体を手元で再ビルドした検証や、native 全部品の許諾本文の完全な集約を行った記録ではない。SPDX の未確定箇所は `NOASSERTION` のまま保持し、公開者はこの範囲を確認して承認する。
