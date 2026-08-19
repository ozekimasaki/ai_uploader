# AI Uploader

AI 生成物（画像・動画・音声・音楽・3D モデルなど）をアップロード・公開・ダウンロードするための Web アプリケーションです。Cloudflare Workers を単一のバックエンドとして、静的アセット配信・SSR での画面描画・API を一体で提供します。

## 概要

- バックエンド / 実行基盤: Cloudflare Workers（素の `fetch` ハンドラでルーティング）
- ストレージ: Cloudflare R2（ファイル本体。Worker 経由のマルチパートアップロード対応）
- メタデータ DB: Cloudflare D1（SQLite 互換。`items` / `tags` / `item_tags` / `users`）
- レート制御 / 使い捨てダウンロードトークン: Durable Objects（`RateLimiter`）
- 認証: Supabase Auth（Discord OAuth）。アクセストークンは `sb-access-token` Cookie で保持
- フロントエンド: Workers による SSR HTML + バニラ JS（`web/public/*.js`）、Tailwind CSS v4
- メディア再生: [Plyr](https://plyr.io/)（CDN 読み込み）
- ビルドツール: Vite 7

> 補足: `plan.md` には将来構想として React / GSAP 等の記載がありますが、現状の実装には含まれていません。本 README は実際のコードに基づいて記述しています。

## 主な機能

- アップロード
  - 通常アップロード: `POST /api/upload`（FormData）
  - マルチパートアップロード（大容量向け、ブラウザ→Workers→R2 プロキシ方式）
    - `POST /api/upload/multipart/init`
    - `PUT  /api/upload/multipart/part`
    - `POST /api/upload/multipart/complete`
    - `POST /api/upload/multipart/abort`
    - R2 へ先行格納したキーを `preuploadedKey` としてメタデータ登録可能
  - 登録項目: タイトル / カテゴリー / 公開範囲（public|private）/ 説明 / Prompt / タグ（最大 5・3〜20 文字・重複不可）/ サムネイル（任意）
- 一覧・詳細（SSR）
  - `GET /`, `GET /items`: 一覧（検索 `q` / カテゴリー `category` / タグ `tag` / 並び替え `sort=popular|new` / ページング `page`）
  - `GET /items/:id`: 詳細（説明・Prompt 表示、Prompt コピー、共有）
  - `GET /u/:username`: ユーザーページ（当該ユーザーの成果物一覧）
  - `GET /upload`: アップロード画面
- 公開 / 削除
  - `POST /api/items/:id/publish`: 公開切替（所有者のみ）
  - `DELETE /api/items/:id`: 削除（所有者のみ）
- ダウンロード
  - `POST /api/items/:id/download-url`: 使い捨てダウンロード URL 発行（要ログイン + レート制御）
  - `GET /api/file?k=...`: ファイル本体ストリーミング（`inline`/`attachment` 切替、ETag / Cache-Control 付与）
  - `GET /api/thumbnail?k=...`: サムネイル配信（未登録時はプレースホルダー PNG）
- 通報: `POST /api/reports`
- 認証系: `GET /auth/config`, `GET /auth/me`, `GET /auth/callback`, `POST /auth/session`, `GET|POST /logout`
- アクセス制御（暫定）: 閲覧系ページ（`/`, `/items`, `/items/:id`, `/u/:username`, `/upload`）およびアップロード / ダウンロード系 API はログイン必須

## 要件

- Node.js（`vite@7` / `wrangler@4` が動作するバージョン。Node 20 以降を推奨）
- npm
- Cloudflare アカウント（デプロイ・R2・D1・Durable Objects 利用時）
- Supabase プロジェクト（Discord OAuth 設定済み）

## インストール

```bash
git clone https://github.com/ozekimasaki/ai_uploader.git
cd ai_uploader
npm install
```

### シークレット / 環境変数

アプリの機密情報は `wrangler secret` で管理します（Git には含めません）。

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `DISCORD_WEBHOOK_URL`（任意）

```bash
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_ANON_KEY
```

ローカル開発では `.dev.vars`（Git 管理対象外）にこれらの値を記述できます。

非機密の構成値（TTL・レート制限・許可拡張子など）は `wrangler.jsonc` の `vars` で定義されています。

## 使い方（開発）

```bash
# API（Cloudflare Workers）をローカル起動
npm run dev:api

# フロント（静的アセット）を Vite で起動
npm run dev:web
```

Workers は静的アセットを `web/dist` から配信する設定（`wrangler.jsonc` の `assets.directory`）のため、Workers 経由で動作確認する場合は先に `npm run build:web` でビルドしてください。

## 開発コマンド

`package.json` の `scripts` に定義されている実在コマンドは以下のとおりです。

| コマンド | 内容 |
| --- | --- |
| `npm run dev:api` | `wrangler dev` で Workers をローカル起動 |
| `npm run dev:web` | `vite dev --root web` でフロントを起動 |
| `npm run build:css` | Tailwind CLI で `web/src/app.css` → `web/public/app.css` をビルド（minify） |
| `npm run build:web` | `build:css` の後に `vite build` を実行 |
| `npm run build` | `build:web` のエイリアス |
| `npm run preview:web` | ビルド済みアセット（`web/dist`）をローカルでプレビュー |
| `npm run deploy` | `wrangler deploy` で Cloudflare へデプロイ |

型チェックは TypeScript コンパイラで実行できます（`tsconfig.json` は `noEmit: true`）。

```bash
npx tsc --noEmit
```

> `npm test` は現状プレースホルダー（`echo "Error: no test specified" && exit 1`）で、テストは未実装です。

### データベース初期化

`schema.sql` に D1 のスキーマ（`users` / `items` / `tags` / `item_tags` とインデックス）が定義されています。

```bash
# ローカル D1 に適用
wrangler d1 execute ai_uploader_db --local --file=./schema.sql

# リモート D1 に適用
wrangler d1 execute ai_uploader_db --remote --file=./schema.sql
```

## 構成

```
.
├── src/
│   └── worker.ts        # Cloudflare Workers エントリポイント（ルーティング / API / SSR / RateLimiter DO）
├── web/
│   ├── index.html       # 静的トップページ
│   ├── public/          # 静的 JS / ビルド済み CSS（app.css, header-login.js, ui-shared.js）
│   └── src/app.css      # Tailwind エントリ（@import "tailwindcss"）
├── schema.sql           # D1 スキーマ定義
├── wrangler.jsonc       # Workers 設定（R2 / D1 / Durable Objects / assets / vars）
├── vite.config.ts       # Vite 設定（root: web, outDir: dist）
├── tsconfig.json        # TypeScript 設定（noEmit, strict）
├── plan.md              # 設計・要件メモ
└── package.json
```

主要バインディング（`wrangler.jsonc`）:

- `R2`（R2 バケット `ai-uploader`）
- `DB`（D1 データベース `ai_uploader_db`）
- `RATE_LIMITER_DO`（Durable Object クラス `RateLimiter`）
- `ASSETS`（`web/dist` の静的アセット）

## デプロイ

```bash
npm run build:web
npm run deploy            # 既定環境
# 本番環境
wrangler deploy --env production
```

本番環境（`wrangler.jsonc` の `env.production`）はカスタムドメイン `uploader.umaibo.dev` に紐づいています。

## ライセンス

`package.json` の `license` フィールドは `ISC` です。
