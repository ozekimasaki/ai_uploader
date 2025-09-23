基本機能(一旦最低限)

## 要件（MVP）
- 対応ファイル種別: 画像（png,jpg,webp）/ 動画（mp4,webm）/ 音声（mp3,wav）/ 音楽（mp3,wav）/ 3D（glb,obj）
- ファイルサイズ上限: 2GB
- アップロード方式: 直R2アップロード（S3互換の署名URL・マルチパート対応）
- 登録時の項目
	- 公開/非公開
	- ファイル本体（必須）
	- タイトル（必須）
	- カテゴリー（必須・固定リストから選択）
	- 説明（任意）
	- Prompt（任意）
	- タグ（任意・最大5・3〜20文字・重複不可・既存リストから選択 or 新規追加）
	- サムネイル（任意。未登録時はプレースホルダー表示）
- 公開機能（publish）
	- 既定はprivate。公開時も閲覧はログイン必須（暫定・セキュリティ優先。将来匿名閲覧を検討）。
- 一覧画面
	- サムネイル/タイトル/カテゴリー/タグの表示
	- タグ・カテゴリーでの絞り込み
	- 検索: キーワード（タイトル/説明/タグ）
 - 並び替え: 人気（downloadCount降順）
	- ページング: ページネーション
	- アクセス: ログイン必須（暫定）
- 詳細画面
	- 登録情報＋ユーザーを表示。ユーザークリックでユーザーページへ。
	- ダウンロードはログイン必須。
	- アクセス: ログイン必須（暫定）
- ユーザー詳細画面
	- 当該ユーザーの成果物一覧。検索は不要。
	- アクセス: ログイン必須（暫定）
- 認証: Supabase Auth（Discord）
- ダウンロード制御
	- ログイン必須 / IPごと1分10回
	- 署名URLのTTL: 15分（既定。長時間DL時は最大120分まで延長可）
- プレビュー/サムネイル
	- サムネ登録がある場合はそれを表示。無い場合は共通プレースホルダー。
	- アクセス: 現状はログイン必須（サムネ/プレビュー配信も保護）
- メタデータ保持
	- ファイル情報は「そのまま保存（EXIF等含む）」
	- 注意: 位置情報などの機微データが含まれる可能性（非機能要件参照）
- 公開範囲: public/private のみ
- カテゴリー: 固定リスト（表示名: 画像/動画/音楽/音声/3Dモデル/その他, DB保存値: IMAGE/VIDEO/MUSIC/VOICE/3D/OTHER）

## 非機能要件
- パフォーマンス
	- 2GB対応のS3マルチパートアップロード（並列アップロード、再開対応）
	- 一覧APIはページネーション＋必要最小フィールドのみ返却
- セキュリティ/プライバシー
	- 署名URL短寿命（提案: 15分）、DLは認証＋レート制御
	- EXIF等の機微データ保持方針: 現状は保持。将来「EXIF除去オプション」を検討
	- TTL解説: 署名URLは短いほど漏洩リスク低/再発行増、長いほど利便性高/共有リスク増。既定15分。大容量/低速回線は60〜120分まで拡張可能（環境変数で調整）。
- 可観測性/運用
	- 監査ログ（誰が何をアップロード/公開/ダウンロードしたか）
	- 失敗時の再試行・一貫性維持（アップロード中断時のクリーンアップ）

## データモデル（論理設計）
- users（認証はSupabase、必要なプロフィールのみ保持）
	- id（外部ID/Supabase user id）
	- username（小文字英数・一意・10文字固定）/ displayName / avatarUrl
	- createdAt
- items（成果物）
	- id（UUID）
	- ownerUserId（users.id）
	- title / category（固定集合） / description / prompt
	- visibility（public|private）/ publishedAt
	- fileKey（R2キー）/ originalFilename / contentType / sizeBytes / sha256 / extension
	- thumbnailKey（R2キー, null可）
	- viewCount / downloadCount（将来の人気順に使用）
	- createdAt / updatedAt / deletedAt(null可)
- tags
	- id（slug, 一意・小文字）/ label（表示名）/ createdAt
- item_tags（多対多）
	- itemId / tagId（複合一意）
- reports（通報）
	- id / itemId / reporterUserId / reason / createdAt / status（open|resolved）

インデックス（例）
	- items: (visibility, publishedAt desc), (downloadCount desc), (category, publishedAt desc)
	- item_tags: (tagId, itemId)

D1設計メモ
- D1はSQLite方言。外部キー制約は有効化が必要な場合あり（`PRAGMA foreign_keys=ON;`）。
- 文字列の大文字小文字無視は `COLLATE NOCASE` を検討（username/tag slugに有効）。
- 高速検索にはインデックスのほか、将来FTS5での全文検索拡張を検討。

注意（データ保存先）
- R2は「ファイル本体」の保存先です。メタデータ（items/tags等）はリレーショナル/キー値DBが必要です。
- メタデータDB: Cloudflare D1 を採用（Cloudflare内で完結）。

## 画面と主要フロー
- アップロードフロー（直R2 + 署名URL）
	1. ユーザー認証（Discord）
	2. フロントがAPIに署名URL（マルチパート）を要求
	3. ブラウザからR2へ直PUT（分割並列）
	4. 完了後、フロントがメタデータをAPIに登録（title等）
	5. 必要に応じて「公開」フラグを更新
- 公開/非公開切替
	- 所有者のみ可能。公開時にpublishedAtを設定。
- 一覧
	- クエリ: page, tag, category, q, sort=popular|new
- ダウンロード
	- ログイン後、APIが短寿命の署名URLを発行。IPごと1分10回で制御。
	- 署名URLは1ダウンロードごとに発行し使い捨て。成功/失敗で監査ログに記録。

運用補足（レート/TTL）
- レート制御はIP + userId + itemIdの複合キーで公平性を担保。
- 既定TTL=15分。大容量DL向けに最大120分までの延長を許容（環境変数）。

## API / ルーティング（Cloudflare Workers 単体）
- 推奨ルーティング（最適案）
	- `GET /` … 新着/人気一覧（`/items`のエイリアス）
	- `GET /items` … 一覧（page, q, tag, category, sort）
	- `GET /items/[id]` … 詳細（SEOはタイトルをmetaに反映。slugは任意）
	- `GET /u/[username]` … ユーザーページ
	- `GET /upload` … アップロード画面（要ログイン）
- API（Cloudflare Workers）
	- `POST /api/upload/presign` … R2用署名URL/マルチパート情報の発行（要ログイン）
	- `POST /api/items` … メタデータ作成（要ログイン）
	- `GET /api/items` … 一覧取得（フィルタ/並び替え/ページング）
	- `GET /api/items/[id]` … 詳細取得
	- `POST /api/items/[id]/publish` … 公開切替（所有者）
	- `DELETE /api/items/[id]` … 削除（所有者）
	- `POST /api/items/[id]/download-url` … 署名URL発行（要ログイン＋レート制御）
	- `POST /api/reports` … 通報作成（ログイン任意）

（認証要件・暫定）
- 閲覧系も現状はログイン必須: `/items`, `/items/[id]`, `/api/thumbnail` など
- `/upload` は引き続きログイン必須

### Workers / ルーティングのポイント
- fetch ハンドラで `new URL(request.url)` により経路判定
- `URLPattern` または正規表現でパスマッチング
- 認証・レート制限は関数分割で共通化（Durable Objects併用可）
- SSR/SSG はMVPでは対象外。フロントは Vite ビルドの SPA を配信
- 静的アセットは Vite 出力（`dist`）を Workers の `assets.directory` として配信

ルーティング指針（回答）
- 詳細ページは「IDを正」とし、`/items/[id]` を正規URLにするのが最適。タイトルはSEOで利用。
- 将来、`/items/[id]-[slug]` 形式に拡張可能（slug不一致時は301で正規化）。

ユーザー名URL
- `GET /u/[username]` を導入。usernameは乱数で自動生成（小文字英数, 10文字固定）。
- 予約語は除外。ユーザー操作での任意変更は不可。
- 将来ポリシー変更で変更を許容する場合は、旧URLから新URLへ301リダイレクト。

予約語（推奨・除外リスト）
- 一般: admin, root, system, support, help, contact
- 認証: login, logout, signin, signout, signup, register, oauth, auth
- API/技術: api, graphql, rest, docs, assets, static, cdn,cdn-cgi, ws, wss
- ルーティング衝突: items, item, upload, downloads, search, tags, tag, users, user, u
- その他: terms, privacy, policy, about, status, health, metrics

## 権限・アクセス制御
- ロール: anonymous / user / owner / admin（初期はadmin機能なし）
- 閲覧: 現状はログイン済ユーザーのみ（public/privateとも）。privateはownerのみ。将来的にpublicの匿名閲覧を検討。
- 作成/更新/削除: ownerのみ
- ダウンロード: user以上（anonymous不可）

## 著作権・ライセンス（初期方針）
- 権利帰属: 原則として投稿主に帰属
- ライセンス表示: 既定は「未設定（All rights reserved）」。選択肢として将来以下を提供:
	- CC BY 4.0（クレジット必須で再利用可）
	- CC BY-SA 4.0（継承条件付き）
	- CC0 1.0（パブリックドメイン相当）
	- 独自ライセンス（任意文面）
- Promptの扱い: 投稿主が任意で公開可。公開時は他者閲覧可能（再利用可否は将来設定）

## UI/UX デザイン
### デザイン方針
- Tailwind CSS（ダークモード対応）
- GSAPは必要箇所のみ最小限
- 可読性重視のタイポグラフィ
- モバイルファースト。Grid/Flex活用
- 軽量・高速（必要時のみGPUアクセラレーション）

## 技術構成
- フロントエンド: Vite 7 + React（TypeScript）
- バックエンド/API: Cloudflare Workers（素のfetch）
- 実行基盤: Cloudflare Workers
- 認証: Supabase Auth（Discord OAuth、JWT トークン管理）
- ストレージ: Cloudflare R2（S3互換API、bucket: ai-uploader、2GB対応マルチパートアップロード）
- メタデータDB: Cloudflare D1（SQLite互換、データベース: ai_uploader_db / ID: 495ad2cd-48b5-46b6-85b0-2a08a7639ea4、外部キー制約・インデックス対応）
- レート制御: Cloudflare Workers + Durable Objects（IP・ユーザー・アイテム複合キーによる公平なレート制限、Durable Objects による分散ロック・状態管理）
- ログ/メトリクス: Cloudflare Logs/Analytics（リアルタイムログ・分析、Workers Logs・Tail Workers 対応）
- ビルドツール: Vite 7（高速開発サーバー）

### フロントエンド技術
- **スタイリング**: Tailwind CSS（ユーティリティファースト、レスポンシブ対応）
- **アニメーション**: GSAP（GreenSock Animation Platform、ScrollTrigger・Timeline 対応）
- **アイコン**: Heroicons または Lucide Icons（SVG アイコンセット）
- **UI コンポーネント**: Headless UI または Radix UI（アクセシビリティ対応）

### パフォーマンス最適化
- **画像最適化**: Cloudflare Images または WebP/AVIF 対応
- **バンドル分割**: Vite のコード分割機能
- **キャッシュ戦略**: Service Worker による静的アセットキャッシュ
- **CDN**: Cloudflare のグローバルエッジネットワーク活用

### 認証・認可詳細
- **認証プロバイダー**: Discord OAuth 2.0（Supabase Auth 経由）
- **セッション管理**: JWT トークン（セキュアなセッション維持）
- **権限レベル**: Anonymous / User / Owner / Admin
- **セキュリティ**: トークン有効期限管理、セキュアなクッキー設定

### Workers + Vite の特徴と制約
- **高速開発**: Vite の開発サーバーで高速なリロード
- **フルスタック**: Workers（API）と Vite（フロント）を同一レポで開発
- **Cloudflare ネイティブ**: Workers、R2、D1 とのシームレスな連携
- **React**: JSX 対応で React コンポーネントを使用可能
- **型安全性**: TypeScript 標準対応で型安全な開発
- **エッジ実行**: Cloudflare エッジでの高速実行

### 環境変数設定
アプリの機密は `wrangler secret` で管理（Gitに含めない）。

- 必須
	- SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
- 構成・動作
	- ENVIRONMENT（development|production）
	- DEFAULT_DOWNLOAD_TTL_MINUTES=15 / MAX_DOWNLOAD_TTL_MINUTES=120
	- RATE_LIMIT_DOWNLOAD_PER_MINUTE=10 / MAX_FILE_SIZE_MB=2048
	- ALLOWED_FILE_TYPES=png,jpg,jpeg,webp,mp4,webm,mp3,wav,glb,obj
- レート制限
	- RATE_LIMIT_UPLOAD_PER_HOUR=50
	- RATE_LIMIT_DOWNLOAD_PER_USER_PER_MINUTE=5
	- RATE_LIMIT_GLOBAL_DOWNLOAD_PER_MINUTE=100

- 管理方法（例）
```bash
wrangler secret put SUPABASE_URL
wrangler secret list
# dev: wrangler dev / prod: wrangler deploy --env production
```

- セキュリティ
	- シークレットは必ず`wrangler secret`
	- 環境分離・キーの定期ローテーション
	- 最小権限・秘密情報をログ出力しない
 
備考: Discord OAuth の `CLIENT_ID/SECRET` はSupabase Auth側で管理するため、本Workerでは不要。

## デプロイメント（Vite + Cloudflare Workers）
- 実行環境: Cloudflare Workers
- フロントエンド: `vite build` で `dist` を生成（静的アセット）
- デプロイコマンド: `wrangler deploy`
- 設定ファイル: `wrangler.jsonc`（Cloudflare バインディング設定）
- ローカル開発: `npm run dev:web`（フロント） と `npm run dev:api`（API）を併用
- 環境変数管理: Wrangler 経由で環境変数設定
- プレビュー: `npm run preview:web`（ビルド後の静的アセットをローカルで確認）
- CI/CD: GitHub Actions でビルド・デプロイ自動化

### Workers + 静的アセット設定（要点）
- 静的: Vite `dist` を `assets.directory` で配信
- エントリ: `main` は `src/worker.ts`
- 連携: R2/D1/KV を wrangler.jsonc でバインド
- 互換: `nodejs_compat` を有効化
- 互換日: 安定版を指定（例: `2025-08-03`）

### 環境別設定
- **開発環境**: `wrangler dev` でローカル実行（環境変数は `.dev.vars` または `wrangler secret` で管理）
- **ステージング環境**: `wrangler deploy --env staging` でステージング環境へのデプロイ
- **本番環境**: `wrangler deploy` で本番環境へのデプロイ（環境変数は `wrangler secret put --env production` で設定）

### 環境変数の設定フロー
1. 開発環境用の環境変数を `wrangler secret put` で設定
2. `.dev.vars` ファイルで開発用のデフォルト値を設定（Git管理対象外）
3. 本番環境用の環境変数を `wrangler secret put` で設定
4. `wrangler secret list` で設定確認
5. アプリケーション起動時の動作確認

### wrangler.jsonc の設定例
```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "ai-uploader",
  "main": "src/worker.ts",
  "compatibility_date": "2025-09-20",
  "compatibility_flags": ["nodejs_compat"],
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

### 参考
- Vite: `https://vitejs.dev/`
- Cloudflare Workers: `https://developers.cloudflare.com/workers/`
- R2: `https://developers.cloudflare.com/r2/`
- D1: `https://developers.cloudflare.com/d1/`
- Durable Objects: `https://developers.cloudflare.com/durable-objects/`
- Tailwind CSS: `https://tailwindcss.com/docs`
- GSAP: `https://gsap.com/docs/`
- Supabase Discord Auth: `https://supabase.com/docs/guides/auth/social-login/auth-discord`

## 運用・セキュリティ
- バックアップ: R2バケットのライフサイクル/バージョニング検討
- 監査: 重要操作（公開/削除/ダウンロードURL発行）をサーバー側で記録
- インシデント: 不適切コンテンツは通報→一時非公開→手動対応
- プライバシー: EXIF保持の注意喚起をUIで明示

---

## 実装済みの +α 機能／補足（現在の実装との差分メモ）

- マルチパートアップロード（Worker経由）
	- `POST /api/upload/multipart/init` / `PUT /api/upload/multipart/part` / `POST /api/upload/multipart/complete` / `POST /api/upload/multipart/abort`
	- ブラウザ→Workers→R2 のプロキシ方式（presign直PUTの代替。将来presign方式と併存/切替可能）
- メタデータ登録API（暫定）
	- `POST /api/upload`（FormData）。大容量時は先にマルチパートでR2へ格納→`preuploadedKey` で登録
	- タグ入力は最大5件・3〜20文字・重複不可（UI補助: 既存タグチップ選択）
- 配信系エンドポイント
	- `GET /api/file?k=...` 本体ストリーミング（`inline/attachment` 切替、ETag/Cache-Control付与）
	- `GET /api/thumbnail?k=...` サムネ配信。無い場合はプレースホルダーPNG
- SSRミニマル画面（Workers内レンダリング）
	- `GET /items` 一覧（検索q/カテゴリ/tag/並び替えpopular|new/ページング）
	- `GET /items/[id]` 詳細（説明・Prompt表示、Promptコピー、共有ボタン［X/LINE/Facebook/URLコピー］）
	- `GET /upload` アップロード画面（進捗ダイアログ/プログレスバー、マルチパート自動切替）
- ダウンロード人気カウントの重複抑止（簡易）
	- Durable Objectを用い、同一IP×同一アイテムで一定期間（TTL=3600秒）内の重複加算を抑止
	- 率制限の「拒否」は未実装（将来トークンバケット等で拡張）
- スキーマ吸収の耐性
	- `PRAGMA table_info` に基づく既存カラム自動検出で `items/tags/item_tags` 挿入を実施（列名バリエーションを吸収）
- ファイルサイズ上限の検証（`MAX_FILE_SIZE_MB`）
	- 環境変数 `ALLOWED_FILE_TYPES` は定義済みだが、拡張子/Content-Type検証は未有効化（今後追加）

### 補足（リポ構成・設定）

- 静的アセット配信の実ディレクトリ
	- 本リポでは `wrangler.jsonc.assets.directory` は `./web/dist`（Viteの`root: web`／`outDir: dist`）
- 将来の方向性
	- 認証（Supabase Auth/Discord）とダウンロードの署名URL発行・TTL・レート制御の厳格化を段階導入
	- presign直PUT方式との併存/切替（現在はWorkers経由方式）