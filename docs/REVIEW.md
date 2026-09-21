# レビュー報告書（UIUX・アクセシビリティ / コード）

本ドキュメントは、Kumo デザイン導入後の UI およびコードベースに対する再レビューの結果と実施した修正の記録です。

## レビュー対象

- `src/views/`（SSR HTML: layout, items, item, upload, user）
- `src/routes/`（API: files, items, upload, auth）
- `web/`（index.html, public/*.js, src/app.css）
- `web/src/app.css`（Kumo トークン利用のコンポーネント層）

## コードレビュー — 発見と対応

| # | 深刻度 | 内容 | 対応 |
|---|--------|------|------|
| 1 | 高 | `POST /api/upload` の `preuploadedKey` 経路で `sizeBytes` をクライアント送信値から採用していた。サイズ上限（MAX_FILE_SIZE_MB）の回避と、R2 未存在キーのアイテム行生成が可能だった | `R2.head()` で存在確認し、実測 `head.size` を採用（`POST /api/items` と同一方針に統一） |
| 2 | 高 | サムネイルの content-type が未検証。`text/html` でアップロードすると公開アイテムの `/api/thumbnail` 経由で同一オリジンに HTML を配信し得た（stored XSS ベクター） | アップロード時に `image/*` のみ受付 + 配信時に非画像 content-type を `application/octet-stream` に強制（多層防御） |
| 3 | 低 | 解釈不能な Range ヘッダ（複数レンジ等）に 416 を返していた。RFC 7233 的には Range 無視→200 が正しい | 正規表現不一致は Range なしとして扱い 200 全文返却に変更 |
| 4 | 低 | `serveFile` 内に到達不能な `if (!user)`（L69 で早期 return 済み） | 削除 |
| 5 | 低 | 検索の LIKE パターンで `%` / `_` を未エスケープ（ユーザー入力がワイルドカードとして解釈される） | `escapeLike()` を追加し `ESCAPE '\'` を付与（API・一覧ページ双方） |
| 6 | 体裁 | `biome` の `lint/style/useTemplate` 指摘（文字列連結 → テンプレートリテラル） | `--write` で一括修正 |

## UIUX / アクセシビリティレビュー — 発見と対応

| # | 内容 | 対応 |
|---|------|------|
| 1 | フォームの `<label>` が `for`/`id` で入力と関連付いていなかった（アップロード画面） | 全フィールドに `for`/`id` を付与（タイトル・カテゴリ・公開範囲・説明・Prompt・タグ・ファイル・サムネイル） |
| 2 | `dropZone` が div のクリックのみでキーボード不可 | `role="button"` `tabindex="0"` `aria-labelledby` 追加 + Enter/Space でファイル選択を開く keydown ハンドラ |
| 3 | 必須の file input が `display:none` で「invalid form control is not focusable」によりブラウザ標準の検証エラーが表示できない | `required` を除去（サーバー側で必須検証済み）+ `tabindex="-1"` + `aria-hidden` |
| 4 | スキップリンクがない | 全ページ（Worker 描画 + 静的 index.html）に「メインコンテンツへスキップ」を追加（`sr-only` + `focus:not-sr-only`） |
| 5 | 装飾的な Font Awesome アイコンがスクリーンリーダーに読まれる可能性 | 全アイコンに `aria-hidden="true"` |
| 6 | アイコン専用ボタン（シェア X/LINE/Facebook、URL コピー）にアクセシブル名がない | `aria-label` 追加（「〜でシェア（新しいタブ）」等） |
| 7 | フィルタフォームの入力が placeholder のみ | `aria-label` を各 input/select に追加（検索キーワード・カテゴリー・タグ・並び順） |
| 8 | ページネーションが div 群のみ | `<nav aria-label="ページネーション">` + 現在ページに `aria-current="page"` |
| 9 | カードタイトルが見出し構造にない | `<h2>` でマークアップ（一覧の見出し階層を成立） |
| 10 | `prefers-reduced-motion` 未対応（ホバー変形・トランジション） | base 層に reduce メディアクエリで全トランジション抑制 |
| 11 | `.navlink` / `.link` / `.badge` にフォーカス可視スタイルがない | `outline: 2px solid --color-kumo-focus` の focus-visible を追加 |
| 12 | アップロード進行が支援技術に通知されない | `progressTip` に `role="status" aria-live="polite"`、進捗バーに `role="progressbar"`、`fileInfo` に `aria-live` |
| 13 | ドラッグ中のハイライトが旧 blue クラスでダークモード不整合 | `border-kumo-focus` / `bg-kumo-tint` に統一 |
| 14 | upload.js の「詳細を開く」リンクが旧 blue クラス | `.link`（Kumo トークン）に変更 |
| 15 | メタ情報の数値（DL数・閲覧数）がアイコンのみで意味が伝わりにくい | `aria-hidden` アイコン + `sr-only` ラベルを追加 |
| 16 | 狭幅（~400px）でヘッダーナビが単語途中で折り返し | `.navlink` に `white-space: nowrap` + nav に `overflow-x: auto` |
| 17 | `.dev.vars` が誤コミットされていた（ダミー値・漏洩なし） | `git rm --cached` + `.gitignore` に `.dev.vars` 追加 |

## 残存する既知事項（対象外 / フォローアップ候補）

- 色コントラスト: Kumo のテキスト/サーフェストークン（`kumo-subtle` 等）は Cloudflare デザイン基準のアクセシビルな組み合わせ。`text-kumo-inactive` はプレースホルダ用途のみ使用。
- `GET /` は静的アセット配信のため Worker のセキュリティヘッダは付かない（仕様上の既知制約）。
- `prefers-color-scheme` の OS デフォルト追従パス（`theme.js` 2行）は GUI テスト未検証。localStorage 経路は検証済みで同一ロジック。
- メタ情報グリッドは `dl/dt/dd` ではなく div grid — 見た目・機能上問題ないが、厳密性を求めるなら将来 `dl` 化可能。
- 実 Discord OAuth はローカル E2E では Supabase スタブ経由で検証。

## 検証

- `npm run check`（Biome lint → tsc → vitest 22件）全パス
- 追加テスト: Range 無視→200 / `preuploadedKey` 実在＋実測サイズ採用 / サムネイル非画像拒否
- E2E（ブラウザ録画）: ライト/ダーク両テーマ全ページ、ログイン→一覧→詳細→ダウンロードのゴールデンパスを確認済み（PR コメント参照）
