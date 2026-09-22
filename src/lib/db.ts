import type { Env, ItemRow, SupabaseUser } from '../env';
import { userAvatarUrl, userDisplayName } from './auth';
import { normalizeUsernameFromId } from './util';

// ensureTables は DDL を含むため、同一 isolate 内では一度だけ実行する
let ensured: Promise<void> | null = null;

export function ensureTables(env: Env): Promise<void> {
  if (!ensured) {
    ensured = runEnsureTables(env).catch((e) => {
      // 一時的な D1 障害で失敗済み Promise を残さない（次リクエストで再試行）
      ensured = null;
      throw e;
    });
  }
  return ensured;
}

export function resetEnsureTablesCacheForTest(): void {
  ensured = null;
}

/** D1 の行（大文字小文字・snake/camel の揺れあり）から最初に存在する値を取り出す */
function pick(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const n of names) {
    if (row[n] !== undefined && row[n] !== null) return row[n];
  }
  return undefined;
}

export function normalizeItemRow(r: Record<string, unknown>): ItemRow {
  return {
    id: String(pick(r, 'id', 'ID') ?? ''),
    ownerUserId: String(pick(r, 'ownerUserId', 'OWNERUSERID', 'owner_user_id', 'OWNER_USER_ID') ?? ''),
    title: String(pick(r, 'title', 'TITLE') ?? 'Untitled'),
    description: String(pick(r, 'description', 'DESCRIPTION') ?? ''),
    prompt: String(pick(r, 'prompt', 'PROMPT') ?? ''),
    category: String(pick(r, 'category', 'CATEGORY') ?? 'OTHER'),
    visibility: String(pick(r, 'visibility', 'VISIBILITY') ?? 'public'),
    originalFilename: String(pick(r, 'original_filename', 'originalFilename', 'ORIGINAL_FILENAME') ?? ''),
    sizeBytes: Number(pick(r, 'size_bytes', 'sizeBytes', 'SIZE_BYTES') ?? 0),
    fileKey: String(pick(r, 'file_key', 'fileKey', 'FILE_KEY') ?? ''),
    thumbnailKey: String(pick(r, 'thumbnail_key', 'thumbnailKey', 'THUMBNAIL_KEY') ?? ''),
    contentType: String(pick(r, 'contentType', 'CONTENTTYPE', 'content_type', 'CONTENT_TYPE') ?? ''),
    extension: String(pick(r, 'extension', 'EXTENSION') ?? ''),
    sha256: String(pick(r, 'sha256', 'SHA256') ?? ''),
    downloadCount: Number(pick(r, 'downloadCount', 'DOWNLOADCOUNT', 'download_count') ?? 0),
    viewCount: Number(pick(r, 'viewCount', 'VIEWCOUNT', 'view_count') ?? 0),
    publishedAt: (pick(r, 'published_at', 'publishedAt', 'PUBLISHED_AT') ?? null) as string | null,
    createdAt: (pick(r, 'created_at', 'createdAt', 'CREATED_AT') ?? null) as string | null,
    updatedAt: (pick(r, 'updated_at', 'updatedAt', 'UPDATED_AT') ?? null) as string | null,
  };
}

export async function fetchItem(env: Env, id: string): Promise<ItemRow | null> {
  const row = (await env.DB.prepare('SELECT * FROM items WHERE id = ? LIMIT 1').bind(id).first()) as Record<string, unknown> | null;
  return row ? normalizeItemRow(row) : null;
}

/** file_key または thumbnail_key が一致するアイテムを取得（ファイル配信の認可判定用） */
export async function fetchItemByFileKey(env: Env, key: string): Promise<ItemRow | null> {
  try {
    const row = (await env.DB.prepare('SELECT * FROM items WHERE file_key = ? OR thumbnail_key = ? LIMIT 1').bind(key, key).first()) as Record<string, unknown> | null;
    if (row) return normalizeItemRow(row);
  } catch {}
  // 旧スキーマ（fileKey 列のみ）のフォールバック
  try {
    const row = (await env.DB.prepare('SELECT * FROM items WHERE fileKey = ? LIMIT 1').bind(key).first()) as Record<string, unknown> | null;
    if (row) return normalizeItemRow(row);
  } catch {}
  return null;
}

export interface TagRow {
  id: string;
  label: string;
}

export async function loadTagsForItems(env: Env, itemIds: string[]): Promise<Record<string, string[]>> {
  const map: Record<string, string[]> = {};
  const ids = itemIds.filter(Boolean);
  if (!ids.length) return map;
  const placeholders = ids.map(() => '?').join(',');
  const res = await env.DB.prepare(
    `SELECT it.itemId as id, GROUP_CONCAT(t.label, ',') as labels
     FROM item_tags it JOIN tags t ON t.id = it.tagId
     WHERE it.itemId IN (${placeholders})
     GROUP BY it.itemId`,
  )
    .bind(...ids)
    .all();
  for (const r of res.results ?? []) {
    const rec = r as Record<string, unknown>;
    const rid = String(rec.id ?? rec.ID ?? '');
    const s = String(rec.labels ?? rec.LABELS ?? '');
    if (rid) map[rid] = s ? s.split(',').map((x) => x.trim()).filter(Boolean) : [];
  }
  return map;
}

export async function loadTagsForItem(env: Env, itemId: string): Promise<string[]> {
  const map = await loadTagsForItems(env, [itemId]);
  return map[itemId] ?? [];
}

export async function listAllTags(env: Env, limit = 200): Promise<TagRow[]> {
  const res = await env.DB.prepare('SELECT id, label FROM tags ORDER BY label COLLATE NOCASE LIMIT ?').bind(limit).all();
  return (res.results ?? []).map((r) => {
    const rec = r as Record<string, unknown>;
    return { id: String(rec.id ?? ''), label: String(rec.label ?? '') };
  });
}

export async function upsertUser(env: Env, user: SupabaseUser): Promise<string> {
  const uid = String(user.id || '');
  if (!uid) return '';
  const display = userDisplayName(user) || uid;
  const avatar = userAvatarUrl(user);
  // 既存 username を尊重しつつ displayName / avatarUrl を最新化
  const existing = (await env.DB.prepare('SELECT username FROM users WHERE id = ? LIMIT 1').bind(uid).first()) as Record<string, unknown> | null;
  let username = String(existing?.username ?? '');
  if (!/^[a-z0-9]{3,32}$/.test(username)) username = normalizeUsernameFromId(uid);
  // username は UNIQUE — 予測可能な生成名が他ユーザーと衝突したら末尾を変えて再試行
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await env.DB.prepare(
        `INSERT INTO users (id, username, displayName, avatarUrl) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET username = excluded.username, displayName = excluded.displayName, avatarUrl = excluded.avatarUrl`,
      )
        .bind(uid, username, display, avatar || null)
        .run();
      return username;
    } catch (e) {
      if (!String((e as Error)?.message || e).includes('UNIQUE')) throw e;
      username = `${normalizeUsernameFromId(uid)}${attempt + 2}`;
    }
  }
  return '';
}

export async function getUsernameById(env: Env, uid: string): Promise<string> {
  try {
    const row = (await env.DB.prepare('SELECT username FROM users WHERE id = ? LIMIT 1').bind(uid).first()) as Record<string, unknown> | null;
    const un = String(row?.username ?? '');
    if (/^[a-z0-9]{3,32}$/.test(un)) return un;
  } catch {}
  return normalizeUsernameFromId(uid);
}

async function runEnsureTables(env: Env): Promise<void> {
  try {
    await env.DB.prepare('PRAGMA foreign_keys=ON;').run();
  } catch {}
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      ownerUserId TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      visibility TEXT NOT NULL,
      description TEXT,
      prompt TEXT,
      original_filename TEXT,
      size_bytes INTEGER,
      file_key TEXT NOT NULL,
      thumbnail_key TEXT,
      published_at TEXT,
      created_at TEXT,
      updated_at TEXT
    )`,
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      displayName TEXT,
      avatarUrl TEXT,
      createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`,
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      created_at TEXT
    )`,
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS item_tags (
      itemId TEXT NOT NULL,
      tagId TEXT NOT NULL,
      UNIQUE(itemId, tagId)
    )`,
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      itemId TEXT NOT NULL,
      reporterUserId TEXT NOT NULL,
      reason TEXT,
      createdAt TEXT NOT NULL,
      status TEXT NOT NULL
    )`,
  ).run();

  // 既存 items テーブルへの不足カラム追加（冪等）
  try {
    const res = await env.DB.prepare('PRAGMA table_info(items)').all();
    const colNames = new Set<string>(
      (res.results ?? []).map((r) => String((r as Record<string, unknown>).name ?? '').toLowerCase()),
    );
    const want: Array<{ name: string; type: string }> = [
      { name: 'ownerUserId', type: 'TEXT' },
      { name: 'title', type: 'TEXT' },
      { name: 'category', type: 'TEXT' },
      { name: 'visibility', type: 'TEXT' },
      { name: 'description', type: 'TEXT' },
      { name: 'prompt', type: 'TEXT' },
      { name: 'original_filename', type: 'TEXT' },
      { name: 'size_bytes', type: 'INTEGER' },
      { name: 'contentType', type: 'TEXT' },
      { name: 'extension', type: 'TEXT' },
      { name: 'sha256', type: 'TEXT' },
      { name: 'downloadCount', type: 'INTEGER' },
      { name: 'viewCount', type: 'INTEGER' },
      { name: 'file_key', type: 'TEXT' },
      { name: 'thumbnail_key', type: 'TEXT' },
      { name: 'published_at', type: 'TEXT' },
      { name: 'created_at', type: 'TEXT' },
      { name: 'updated_at', type: 'TEXT' },
      { name: 'createdAt', type: 'TEXT' },
      { name: 'updatedAt', type: 'TEXT' },
    ];
    for (const w of want) {
      if (!colNames.has(w.name.toLowerCase())) {
        await env.DB.prepare(`ALTER TABLE items ADD COLUMN ${w.name} ${w.type}`).run();
      }
    }
    const has = (n: string) => colNames.has(n.toLowerCase());
    if (has('visibility') && has('published_at')) {
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_items_visibility_publishedAt ON items (visibility, published_at DESC)').run();
    }
    if (has('category') && has('published_at')) {
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_items_category_publishedAt ON items (category, published_at DESC)').run();
    }
    if (has('downloadcount')) {
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_items_downloadCount ON items (downloadCount DESC)').run();
    }
    if (has('viewcount')) {
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_items_viewCount ON items (viewCount DESC)').run();
    }
  } catch {}

  try {
    await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_item_tags_tag_item ON item_tags (tagId, itemId)').run();
  } catch {}
}
