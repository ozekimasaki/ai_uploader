# AI Uploader

AI生成コンテンツを安全に共有できるプラットフォームです。

## 機能

- **多様なファイル形式対応**: 画像（PNG, JPG, WebP）、動画（MP4, WebM）、音楽・音声（MP3, WAV）、3Dモデル（GLB, OBJ）
- **大容量ファイル対応**: 最大2GBまでのファイルをアップロード可能
- **公開・非公開設定**: コンテンツの公開範囲を柔軟に制御
- **タグ付け機能**: コンテンツの分類と検索を容易に
- **ユーザー認証**: Discord OAuthによる安全な認証
- **ダウンロード制御**: レート制限と認証によるダウンロード管理
- **レスポンシブデザイン**: モバイルからデスクトップまで対応

## 技術構成

- **フレームワーク**: HonoX（Honoベースのメタフレームワーク）
- **実行環境**: Cloudflare Workers
- **認証**: Supabase Auth（Discord OAuth）
- **ストレージ**: Cloudflare R2（S3互換API）
- **データベース**: Cloudflare D1（SQLite互換）
- **レート制限**: Cloudflare Workers + Durable Objects
- **UI**: Tailwind CSS, GSAP, Heroicons/Lucide Icons

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 機密情報の設定

**⚠️ 重要: 以下の機密情報はGitHubにアップロードしないでください**

#### Supabase設定

1. Supabaseプロジェクトで以下の値を確認してください：
   - **Project URL**: `https://your-project-id.supabase.co`
   - **anon/public key**: プロジェクト設定から取得
   - **service_role key**: プロジェクト設定から取得（機密）

2. 以下のコマンドでシークレットとして設定してください：

```bash
# Supabase URL
wrangler secret put SUPABASE_URL

# Supabase API Keys
wrangler secret put SUPABASE_ANON_KEY
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

#### 環境設定

`wrangler.jsonc` で以下を設定してください：

:::note
Cloudflareは新しいプロジェクトで `wrangler.jsonc` を推奨しています。一部の新しい機能はJSON設定ファイルでのみ利用可能です。
:::

JSON形式（wrangler.jsonc）の場合：

```jsonc
{
  "vars": {
    "ENVIRONMENT": "production"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "ai_uploader_db",
      "database_id": "495ad2cd-48b5-46b6-85b0-2a08a7639ea4"
    }
  ],
  "r2_buckets": [
    {
      "binding": "R2",
      "bucket_name": "ai-uploader"
    }
  ],
  "durable_objects": {
    "bindings": [
      {
        "name": "RATE_LIMITER_DO",
        "class_name": "RateLimiter"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_classes": ["RateLimiter"]
    }
  ],
  "assets": {
    "directory": "./dist"
  }
}
```

#### シークレットの設定例

```bash
# 開発環境でのシークレット設定
wrangler secret put SUPABASE_URL --env development
wrangler secret put SUPABASE_ANON_KEY --env development
wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env development

# 本番環境でのシークレット設定
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_ANON_KEY
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

#### デプロイ時の注意事項

- シークレットは `wrangler secret put` コマンドで設定してください
- GitHub ActionsなどのCI/CDでは、GitHub Secretsから環境変数を設定してください
- 機密情報は絶対にGitリポジトリにコミットしないでください

### 3. データベースマイグレーション

```bash
npm run db:migrate
```

### 4. 開発サーバーの起動

```bash
npm run dev
```

### 5. ビルドとデプロイ

```bash
npm run build
npm run deploy
```

## プロジェクト構造

```
app/
├── components/          # Reactコンポーネント
├── middleware/          # Honoミドルウェア
├── routes/             # ルーティング
│   ├── api/           # APIエンドポイント
│   └── (pages)        # フロントエンドページ
├── types/             # TypeScript型定義
├── utils/             # ユーティリティ関数
└── styles.css         # グローバルスタイル
```

## API エンドポイント

### 認証
- `GET /api/auth/me` - 現在のユーザー情報取得
- `GET /api/auth/discord` - Discord OAuth URL取得
- `POST /api/auth/logout` - ログアウト

### アップロード
- `POST /api/upload/presign` - 署名付きアップロードURL取得

### アイテム
- `GET /api/items` - アイテム一覧取得
- `POST /api/items` - アイテム作成
- `GET /api/items/:id` - アイテム詳細取得
- `PUT /api/items/:id` - アイテム更新
- `DELETE /api/items/:id` - アイテム削除
- `POST /api/items/:id/publish` - 公開設定変更
- `POST /api/items/:id/download-url` - ダウンロードURL取得

## セキュリティ

- JWTトークンによる認証
- IPアドレスベースのレート制限
- ファイル形式とサイズの検証
- 署名付きURLの短寿命化（デフォルト15分）
- 機密データの保持方針（EXIF等）

## ライセンス

MIT License

## 貢献

バグ報告や機能リクエストはGitHubのIssueでお願いします。
