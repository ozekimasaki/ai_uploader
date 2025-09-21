# AI Uploader (MVP)

## 必要ツール
- Node.js 20+
- npm
- Cloudflare Wrangler (`npm i -g wrangler` でも可)

## セットアップ
```bash
npm install
```

## 環境変数（wrangler secret / vars）
- SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
- ENVIRONMENT (development|production)
- DEFAULT_DOWNLOAD_TTL_MINUTES, MAX_DOWNLOAD_TTL_MINUTES
- RATE_LIMIT_DOWNLOAD_PER_MINUTE, RATE_LIMIT_UPLOAD_PER_HOUR
- RATE_LIMIT_DOWNLOAD_PER_USER_PER_MINUTE, RATE_LIMIT_GLOBAL_DOWNLOAD_PER_MINUTE
- MAX_FILE_SIZE_MB, ALLOWED_FILE_TYPES
- R2_BUCKET (vars)
- R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY

```bash
wrangler secret put SUPABASE_URL
wrangler secret list
```

## 開発
別ターミナルで以下を起動:
```bash
npm run dev:web    # Vite (web)
npm run dev:api    # Wrangler (API)
```

## ビルド
```bash
npm run build:web
```

## デプロイ
```bash
npm run deploy
```

## ディレクトリ
- `web/` … SPA (Vite + React + Tailwind)
- `src/` … Cloudflare Workers (API, Durable Objects)
- `migrations/` … D1 初期スキーマ

