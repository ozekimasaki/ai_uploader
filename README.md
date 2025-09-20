# AI Uploader

クリエイティブ作品共有プラットフォーム。画像、動画、音楽、3Dモデルなどのファイルをアップロードして共有できます。

## 機能

- 📤 ファイルアップロード（最大2GB）
- 🔐 Discord認証
- 📋 作品一覧・詳細表示
- 👤 ユーザーページ
- ⬇️ ダウンロード機能（レート制限付き）
- 📱 レスポンシブデザイン

## セットアップ

### 1. 環境変数の設定

`.env.local`ファイルを作成し、以下の環境変数を設定してください：

```bash
# Supabase設定
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Cloudflare設定
DOWNLOAD_TTL_MINUTES=15
DOWNLOAD_TTL_MAX_MINUTES=120
```

### 2. Supabaseプロジェクトの作成

1. [Supabase](https://supabase.com/)にアクセスして新規プロジェクトを作成
2. プロジェクト設定 > Authentication > ProvidersでDiscordを有効化
3. Discordアプリケーションを作成し、Client IDとClient Secretを取得
4. SupabaseのDiscordプロバイダー設定に貼り付け

### 3. Discordアプリケーションの作成

1. [Discord Developer Portal](https://discord.com/developers/applications)にアクセス
2. 新規アプリケーションを作成
3. OAuth2 > GeneralでClient IDとClient Secretを取得
4. Redirect URIsに以下のURLを追加：
   - `http://localhost:3000/auth/callback`（開発環境）
   - 本番環境のURL

### 4. Cloudflare設定

#### D1データベース
```bash
wrangler d1 create ai_uploader_db
```

#### R2バケット
Cloudflare DashboardでR2バケット`ai-uploader`を作成

#### KV名前空間（レート制限用）
```bash
wrangler kv:namespace create rate_limit_kv
```

### 5. 開発サーバー起動

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## GitHub連携でのCloudflare Pagesデプロイ（推奨）

### 6.1 GitHubリポジトリの準備

1. **GitHubリポジトリ作成**
   ```bash
   # リポジトリ名: ai-uploader
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/ai-uploader.git
   git push -u origin main
   ```

2. **プロジェクト構造の確認**
   ```
   ai_uploader/
   └── web/                    # Next.jsプロジェクト
       ├── src/
       ├── public/
       ├── package.json
       ├── wrangler.toml
       └── next.config.ts
   ```

### 6.2 Cloudflare PagesへのGitHub連携

1. **Cloudflare Dashboardにアクセス**
   - https://dash.cloudflare.com/

2. **Pagesプロジェクト作成**
   ```
   左メニュー > Workers & Pages > Pages > Create a project
   - Connect to Git: GitHubを選択
   - Choose a repository: ai-uploaderを選択
   - Production branch: main
   ```

3. **ビルド設定**
   ```
   Build command: npm run build
   Build output directory: .next
   Root directory: web/  (重要: webフォルダを指定)
   ```

4. **環境変数の設定**（Pagesダッシュボードで設定）
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   DOWNLOAD_TTL_MINUTES=15
   DOWNLOAD_TTL_MAX_MINUTES=120
   ```

### 6.3 D1・R2・KVのバインディング設定

**Pagesダッシュボード** > プロジェクト設定 > Functions で設定：

```toml
# 自動的に適用される設定
[[d1_databases]]
binding = "DB"
database_name = "ai_uploader_db"
database_id = "495ad2cd-48b5-46b6-85b0-2a08a7639ea4"

[[r2_buckets]]
binding = "R2"
bucket_name = "ai-uploader"

[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "your-kv-namespace-id"
```

### 6.4 デプロイと動作確認

1. **GitHubにプッシュ**
   ```bash
   git add .
   git commit -m "Deploy to Cloudflare Pages"
   git push
   ```

2. **自動デプロイ開始**
   - Cloudflare Pagesが自動で検知してビルド開始
   - 数分でデプロイ完了

3. **動作確認**
   - PagesダッシュボードでデプロイURLを確認
   - Discord認証が動作するかテスト
   - D1データベース・R2ストレージが機能するかテスト

### 6.5 Cloudflare Dashboardでのリソース設定

#### D1データベース
```
左メニュー > Workers & Pages > D1
- データベース名: ai_uploader_db
- Database ID: 495ad2cd-48b5-46b6-85b0-2a08a7639ea4
```

#### R2バケット
```
左メニュー > R2
- バケット名: ai-uploader
- Publicアクセス: 制限付き（署名付きURLのみ）
```

#### KV名前空間
```
左メニュー > Workers & Pages > KV
- Namespace名: rate_limit_kv
- Namespace ID: 要確認
```

### 6.6 トラブルシューティング

**ビルドエラー発生時**:
1. Pagesダッシュボード > プロジェクト > Deployments でログ確認
2. Build commandが正しく設定されているか確認
3. Environment variablesが正しく設定されているか確認

**D1/R2接続エラー時**:
1. Pagesダッシュボード > プロジェクト > Settings > Functions
2. Bindingsが正しく設定されているか確認
3. Database IDとBucket名が一致しているか確認

### 6.7 ローカル開発環境の注意事項

**開発環境では以下の制限があります：**
- Cloudflare D1データベースは利用不可 → モックデータを使用
- Cloudflare R2ストレージは利用不可 → モックURLを使用
- Cloudflare KV（レート制限）は利用不可 → 簡易レート制限

**これらの制限は以下の方法で解消されます：**
- `wrangler dev` コマンドを使用
- Cloudflare Pagesにデプロイ
- または本番環境

**テスト用APIエンドポイント：**
- 認証テスト: http://localhost:3000/api/auth/test
- 作品一覧: http://localhost:3000/api/items
- アップロード: http://localhost:3000/api/upload/presign

## クイックスタート（GitHub連携デプロイ）

### ステップバイステップ

1. **GitHubリポジトリ作成・プッシュ**
   ```bash
   cd C:\Users\masam\Documents\ai_uploader
   git init
   git add .
   git commit -m "Initial commit: AI Uploader with Discord auth"
   # GitHubでリポジトリ作成後
   git remote add origin https://github.com/yourusername/ai-uploader.git
   git push -u origin main
   ```

2. **Cloudflare PagesでGitHub連携**
   - https://dash.cloudflare.com/ > Pages > Create a project
   - GitHubを選択 > ai-uploaderリポジトリを選択
   - Build settings:
     - Build command: `npm run build`
     - Build output directory: `.next`
     - Root directory: `web/`

3. **環境変数設定**（Pagesダッシュボードで）
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   DOWNLOAD_TTL_MINUTES=15
   DOWNLOAD_TTL_MAX_MINUTES=120
   ```

4. **Bindings設定**（Pages > Settings > Functions）
   - D1 Database: ai_uploader_db
   - R2 Bucket: ai-uploader
   - KV Namespace: rate_limit_kv

5. **GitHubにプッシュして自動デプロイ**
   ```bash
   git add .
   git commit -m "Deploy to Cloudflare Pages"
   git push
   ```

**🎉 完了！** PagesダッシュボードからデプロイURLを確認できます。

## 技術構成

- **Frontend**: Next.js 15 (App Router)
- **Authentication**: Supabase Auth + Discord
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2
- **Styling**: Tailwind CSS
- **Deployment**: Cloudflare Workers/Pages

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
