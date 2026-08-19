# AGENTS.md

このリポジトリで作業するコーディングエージェント向けのガイドです。実際のコード・設定に基づいて記述しています。憶測で存在しないコマンドや機能を追加しないでください。

## プロジェクト構成 / エントリポイント

- `src/worker.ts` — Cloudflare Workers の単一エントリポイント。`export default { fetch }` でルーティング・API・SSR HTML 描画をすべて担い、末尾で Durable Object クラス `RateLimiter` を `export` しています（約 2,200 行の 1 ファイル構成）。
- `web/index.html` — 静的トップページ。
- `web/public/` — 静的配信される JS とビルド済み CSS（`header-login.js`, `ui-shared.js`, `app.css`）。
- `web/src/app.css` — Tailwind エントリ（`@import "tailwindcss";`）。`build:css` で `web/public/app.css` を生成します。
- `schema.sql` — Cloudflare D1 のスキーマ（`users` / `items` / `tags` / `item_tags` + インデックス）。
- `wrangler.jsonc` — Workers 設定（`main: src/worker.ts`、R2 / D1 / Durable Objects バインディング、`assets.directory: ./web/dist`、`vars`、`env.production`）。
- `vite.config.ts` — `root: 'web'`, `build.outDir: 'dist'`, `sourcemap: true`。
- `tsconfig.json` — `strict: true`, `noEmit: true`, `moduleResolution: Bundler`, `types: ["@cloudflare/workers-types"]`。
- `plan.md` — 設計・要件メモ。将来構想（React / GSAP / presign 直 PUT 等）を含み、現状の実装と一致しない箇所があります。**実装の正は `src/worker.ts` です。**

## セットアップ

```bash
npm install
```

シークレット（`SUPABASE_URL`, `SUPABASE_ANON_KEY`, 任意で `DISCORD_WEBHOOK_URL`）は `wrangler secret put`、またはローカルでは `.dev.vars`（Git 管理対象外）で設定します。非機密の構成値は `wrangler.jsonc` の `vars` にあります。

D1 スキーマ適用:

```bash
wrangler d1 execute ai_uploader_db --local --file=./schema.sql
```

## ビルド / テスト / lint / typecheck の実在コマンド

`package.json` に定義されているコマンドのみを使用してください。

- ビルド: `npm run build`（= `npm run build:web` = `build:css` → `vite build`）
- CSS ビルド: `npm run build:css`
- ローカル起動（API）: `npm run dev:api`（`wrangler dev`）
- ローカル起動（フロント）: `npm run dev:web`（`vite dev --root web`）
- プレビュー: `npm run preview:web`
- デプロイ: `npm run deploy`（`wrangler deploy`）／本番は `wrangler deploy --env production`
- 型チェック: `npx tsc --noEmit`（専用の npm script はありません）

注意事項:

- **テストは未実装です。** `npm test` はプレースホルダー（`echo "Error: no test specified" && exit 1`）で必ず失敗します。テストがないことを前提に作業してください。
- **lint / formatter の設定はありません**（ESLint / Prettier の設定ファイルは存在しません）。コード変更後の最低限の検証は `npx tsc --noEmit` を実行してください。
- Workers は静的アセットを `web/dist` から配信するため、Workers 経由の動作確認前に `npm run build:web` が必要です。

## コーディング規約

- 言語 / 型: TypeScript（`strict: true`）。UI 文言・コメントは日本語が基本です。既存のスタイルに合わせてください。
- **`any` の使用は避けてください。** `.cursor/rules/v5-1.mdc` でも `any` 使用が禁止事項として明記されています。既存コードには一部 `any` が残っていますが、新規コードでは適切な型付けを行ってください。
- 依存追加は最小限に。バックエンドは Cloudflare Workers ランタイム上で動作するため、Node 固有 API に依存しないでください（`wrangler.jsonc` で `nodejs_compat` は有効）。フロントは追加ライブラリを CDN 経由で読み込む既存方式（例: Supabase JS を `esm.sh`、Plyr を jsDelivr）に倣ってください。
- HTML を文字列生成する箇所ではユーザー入力を必ず `escapeHtml` でエスケープしてください（`src/worker.ts` の既存パターンに従う）。
- ルーティングは `src/worker.ts` の `fetch` 内で `url.pathname` と `req.method` による分岐、動的セグメントは正規表現（例: `/^\/api\/items\/([A-Za-z0-9_-]+)$/`）で行います。新規ルートも同様に追加してください。
- スキーマ変更は破壊的変更になり得ます。`.cursor/rules/v5-1.mdc` の方針に従い、DB スキーマ変更・セキュリティ設定変更・本番影響のある変更は事前承認を得てください。

## 注意点

- 認証は Supabase Auth（Discord OAuth）。アクセストークンは `sb-access-token` Cookie または `Authorization: Bearer` で受け取り、`fetchSupabaseUser` で検証します。
- レート制御と使い捨てダウンロードトークンは Durable Object `RateLimiter` が担います。`wrangler.jsonc` の `migrations`（tag `v1` で `RateLimiter` を登録）を壊さないでください。DO クラス名変更にはマイグレーションが必要です。
- 閲覧系ページも現状はログイン必須（暫定仕様）です。アクセス制御を緩める変更は仕様判断を伴うため、勝手に変更しないでください。
- シークレットや個人情報をログ出力・コミットしないでください。`.dev.vars` / `.env` はコミット禁止（`.gitignore` 済み）。
- 変更は目的に沿った最小限に留め、無関係なファイル・生成物（`web/public/app.css` は `build:css` の出力）を手動で書き換えないでください。
- pre-commit フック等（`.husky/` や `.pre-commit-config.yaml`）はこのリポジトリには存在しません。
