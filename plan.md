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
	- タグ（任意・最大5・3〜20文字・重複不可・既存リストから選択）
	- サムネイル（任意。未登録時はプレースホルダー表示）
- 公開機能（publish）
	- 既定はprivate。公開時は未ログインでも閲覧可能。
- 一覧画面
	- サムネイル/タイトル/カテゴリー/タグの表示
	- タグ・カテゴリーでの絞り込み
	- 検索: キーワード（タイトル/説明/タグ）
 - 並び替え: 人気（downloadCount降順）
	- ページング: ページネーション
- 詳細画面
	- 登録情報＋ユーザーを表示。ユーザークリックでユーザーページへ。
	- ダウンロードはログイン必須。
- ユーザー詳細画面
	- 当該ユーザーの成果物一覧。検索は不要。
- 認証: Supabase Auth（Discord）
- ダウンロード制御
	- ログイン必須 / IPごと1分10回
	- 署名URLのTTL: 15分（既定。長時間DL時は最大120分まで延長可）
- プレビュー/サムネイル
	- サムネ登録がある場合はそれを表示。無い場合は共通プレースホルダー。
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

## API / ルーティング（Next.js + Cloudflare Workers）
- 推奨ルーティング（最適案）
	- `GET /` … 新着/人気一覧（`/items`のエイリアス）
	- `GET /items` … 一覧（page, q, tag, category, sort）
	- `GET /items/[id]` … 詳細（SEOはタイトルをmetaに反映。slugは任意）
	- `GET /u/[username]` … ユーザーページ
	- `GET /upload` … アップロード画面（要ログイン）
- API（Route Handlers）
	- `POST /api/upload/presign` … R2用署名URL/マルチパート情報の発行（要ログイン）
	- `POST /api/items` … メタデータ作成（要ログイン）
	- `GET /api/items` … 一覧取得（フィルタ/並び替え/ページング）
	- `GET /api/items/[id]` … 詳細取得
	- `POST /api/items/[id]/publish` … 公開切替（所有者）
	- `DELETE /api/items/[id]` … 削除（所有者）
	- `POST /api/items/[id]/download-url` … 署名URL発行（要ログイン＋レート制御）
	- `POST /api/reports` … 通報作成（ログイン任意）

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
- 閲覧: publicは誰でも、privateはownerのみ
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

## 技術構成
- フロント/SSR: Next.js（App Router）
- 実行基盤: Cloudflare Workers（Next.jsは `next-on-pages` 相当のアダプタでPages/Functions上にデプロイ）
- 認証: Supabase Auth（Discord）
- ストレージ: Cloudflare R2（S3互換API）
- メタデータDB: Cloudflare D1（採用）
- レート制御: Cloudflare Workers + KV/Durable Objects（IPごとトークンバケット）
- ログ/メトリクス: Cloudflare Logs/Analytics（必要に応じて）

### 参考ドキュメント
- Cloudflare R2（S3互換・マルチパート/署名URL）: `https://developers.cloudflare.com/r2/`
- Cloudflare D1（SQLite互換・インデックス/FTS）: `https://developers.cloudflare.com/d1/`
- Cloudflare Workers（Rate Limiting/DO/KV）: `https://developers.cloudflare.com/workers/`
- Next.js on Cloudflare Pages: `https://developers.cloudflare.com/pages/framework-guides/deploy-a-nextjs-site/`
- Supabase Auth Discord: `https://supabase.com/docs/guides/auth/social-login/auth-discord`

## 運用・セキュリティ
- バックアップ: R2バケットのライフサイクル/バージョニング検討
- 監査: 重要操作（公開/削除/ダウンロードURL発行）をサーバー側で記録
- インシデント: 不適切コンテンツは通報→一時非公開→手動対応
- プライバシー: EXIF保持の注意喚起をUIで明示

---