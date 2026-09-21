# 機能説明

AI Uploader の機能一覧と使い方です。

## 概要

AI 生成物（画像・動画・音声・音楽・3D モデルなど）をアップロード・公開・共有・ダウンロードする Web アプリ。Cloudflare Workers 上で SSR + API + ファイル配信を一体で提供します。

## 画面

| パス | 内容 | 認証 |
| --- | --- | --- |
| `/` | ランディングページ（機能紹介） | 不要（静的配信） |
| `/items` | 作品一覧。検索・カテゴリ・タグ・並び替え・ページング | 要ログイン |
| `/items/:id` | 作品詳細。プレビュー・メタ情報・説明・Prompt・共有・ダウンロード | 要ログイン |
| `/u/:username` | ユーザーページ。その人の作品一覧（本人なら非公開も表示） | 要ログイン |
| `/upload` | アップロードフォーム | 要ログイン |

> 閲覧系ページは暫定仕様としてすべてログイン必須です。

## 認証

- Supabase Auth の **Discord OAuth** でログイン
- ログインボタン → Discord 認可 → `/auth/callback` → `POST /auth/session` で `sb-access-token`（HttpOnly, SameSite=Lax, 1時間）Cookie を発行
- `/logout` で Cookie を削除してログアウト
- `GET /auth/me` で現在のログイン状態・ユーザー名を返却
- 初回ログイン時に `users` テーブルへユーザー情報（username・表示名・アバター）を自動登録

## アップロード

`/upload` または API から。登録項目:

- **タイトル**（必須, 200文字）
- **カテゴリー**（必須）: 画像 / 動画 / 音楽 / ボイス / 3D / その他
- **公開範囲**: 公開 or 非公開
- **説明**（5000文字）、**Prompt**（10000文字。生成プロンプトを記録・共有用）
- **タグ**: 最大5個・3〜20文字・重複不可。既存タグはクリックで追加可能
- **サムネイル**（任意。未設定時はプレースホルダー）
- **本体ファイル**（必須。`MAX_FILE_SIZE_MB` 上限、デフォルト 2048MB。`ALLOWED_FILE_TYPES` で拡張子制限）

アップロード方式:

- **通常**: `POST /api/upload`（FormData、ファイル本体 + メタデータを一括送信）
- **マルチパート**（大容量向け）: `POST /api/upload/multipart/init` → `PUT /api/upload/multipart/part`（ブラウザは3並列で分割 PUT）→ `POST /api/upload/multipart/complete` / `abort`
  - 中間ファイルは R2 の `uploads/{ユーザーID}/` 配下に置かれ、所有者以外は操作不可（IDOR 対策）
  - メタデータ登録は `POST /api/items` に `fileKey`（または `/api/upload` の `preuploadedKey`）
- 小さいファイルは sha256 ハッシュを計算して保存（重複・整合性チェック用）

## 一覧・検索（`/items`）

- キーワード検索 `q`（タイトル・説明・タグを LIKE 検索）
- カテゴリ絞り込み `category`、タグ `tag`、並び替え `sort=new|popular`（人気順 = ダウンロード数→閲覧数）
- ページング `page`（20件/ページ。前へ/次へは絞り込み条件を保持）
- カードにはサムネイル・タイトル・カテゴリバッジ・DL/閲覧数・タグチップを表示

## 作品詳細（`/items/:id`）

- カテゴリに応じたプレビュー（画像は img、動画は Plyr プレイヤー、音声は audio、その他はサムネイル）
- メタ情報（投稿者・カテゴリ・サイズ・作成日・ファイル名・DL/閲覧数）
- 説明・Prompt（Prompt はワンクリックでコピー）
- SNS 共有ボタン（X / LINE / Facebook / URL コピー）
- 閲覧数は同一 IP×同一アイテムで 1 時間に 1 回だけ加算（Durable Object で重複排除）
- 所有者のみの操作: **公開/非公開の切替**・**削除**
- 誰でも: **通報**（`POST /api/reports` → Discord Webhook に通知）

## ダウンロード

1. `POST /api/items/:id/download-url` — 使い捨てダウンロード URL を発行（要ログイン。アイテム単位・ユーザー単位・グローバルの3段レート制限あり）
2. 返された `url`（`/api/file?t=...`）に GET — トークンは 1 回使うと失効（再利用は 410）。TTL は `DEFAULT_DOWNLOAD_TTL_MINUTES`〜`MAX_DOWNLOAD_TTL_MINUTES`

`GET /api/file?k=...`:

- 本体ファイルをストリーミング（R2 → Worker 経由）
- **Range リクエスト対応**（`206 Partial Content` / 不正時 `416`）— 動画シークに有効
- `Content-Disposition` は `inline`（プレビュー）/`attachment`（`download=1`）を切替、ファイル名は RFC 5987 `filename*` 付きでサニタイズ
- `GET /api/thumbnail?k=...` — サムネイル（未登録時はプレースホルダー PNG）
- 非公開アイテムのファイル/サムネイルは所有者以外 404（IDOR 対策）

## ユーザー体験

- **ライト/ダークモード** — ヘッダーの切替ボタン（localStorage 保存、初回は OS 設定に追従）。Cloudflare Kumo のデザイントークンで自動的に配色が切り替わる
- レスポンシブ対応（一覧は可変グリッド、詳細はモバイルで単段）
- FontAwesome アイコン、Plyr によるメディア再生

## セキュリティ

- CSP（インライン JS なし、`script-src 'self'` + 許可 CDN のみ）・nosniff・frame-ancestors・Referrer-Policy・Permissions-Policy を全 HTML/API に付与
- Cookie 認証の変更系 API は `Sec-Fetch-Site`/`Origin` で CSRF チェック（Bearer 認証は対象外）
- HTML 埋め込みは `escapeHtml`、ページ内 JSON は `<` を `\u003c` にエスケープ
- レート制限・使い捨てトークン・重複排除は Durable Object `RateLimiter` で管理

## API 一覧

| メソッド | パス | 内容 |
| --- | --- | --- |
| GET | `/auth/config` | Supabase URL/anon key 返却 |
| GET | `/auth/me` | ログイン状態 |
| GET | `/auth/callback` | OAuth コールバックページ |
| POST | `/auth/session` | アクセストークン → Cookie 発行 |
| GET/POST | `/logout` | ログアウト |
| GET | `/api/items` | 一覧（公開のみ。q/category/tag/sort/page） |
| POST | `/api/items` | メタデータ登録（`fileKey` は自分の `uploads/{uid}/` 配下のみ） |
| GET | `/api/items/:id` | 詳細（非公開は所有者のみ） |
| DELETE | `/api/items/:id` | 削除（所有者のみ。R2 も削除） |
| POST | `/api/items/:id/publish` | 公開切替 `{visibility}`（所有者のみ） |
| POST | `/api/items/:id/download-url` | 使い捨て DL URL 発行 |
| GET/HEAD | `/api/file` | ファイル配信（`k` or `t`。Range 対応） |
| GET/HEAD | `/api/thumbnail` | サムネイル配信 |
| POST | `/api/upload` | FormData 一括アップロード |
| POST | `/api/upload/multipart/init` | マルチパート開始 |
| PUT | `/api/upload/multipart/part` | パート送信（`key`,`uploadId`,`partNumber`） |
| POST | `/api/upload/multipart/complete` | 完了 `{key,uploadId,parts:[{partNumber,etag}]}` |
| POST | `/api/upload/multipart/abort` | 中止 |
| POST | `/api/reports` | 通報 `{itemId, reason}` |
| GET | `/api/debug/*` | レート制限/トークン確認（`ENVIRONMENT=development` のみ） |
