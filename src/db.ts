export type Db = D1Database;

export function toDbNow(): string {
  return new Date().toISOString();
}

export const VALID_CATEGORIES = ['IMAGE', 'VIDEO', 'MUSIC', 'VOICE', '3D', 'OTHER'] as const;
export type Category = typeof VALID_CATEGORIES[number];

export async function ensureUser(db: Db, userId: string, opts?: { username?: string; displayName?: string; avatarUrl?: string }) {
  const existing = await db.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
  if (existing) return;
  let username = (opts?.username || `u${userId.replace(/[^a-z0-9]/gi, '').toLowerCase()}`).slice(0, 10);
  if (username.length < 10) username = (username + 'xxxxxxxxxx').slice(0, 10);
  await db.prepare('INSERT INTO users (id, username, displayName, avatarUrl, createdAt) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(userId, username, opts?.displayName ?? null, opts?.avatarUrl ?? null, toDbNow())
    .run();
}

export interface CreateItemInput {
  id: string;
  ownerUserId: string;
  title: string;
  category: Category;
  description?: string | null;
  prompt?: string | null;
  fileKey: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  sha256?: string | null;
  extension?: string | null;
  thumbnailKey?: string | null;
}

export async function createItem(db: Db, input: CreateItemInput) {
  const now = toDbNow();
  await db.prepare(
    `INSERT INTO items (
      id, ownerUserId, title, category, description, prompt, visibility, publishedAt,
      fileKey, originalFilename, contentType, sizeBytes, sha256, extension, thumbnailKey,
      viewCount, downloadCount, createdAt, updatedAt, deletedAt
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'private', NULL, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 0, 0, ?14, ?14, NULL)`
  )
    .bind(
      input.id,
      input.ownerUserId,
      input.title,
      input.category,
      input.description ?? null,
      input.prompt ?? null,
      input.fileKey,
      input.originalFilename,
      input.contentType,
      input.sizeBytes,
      input.sha256 ?? null,
      input.extension ?? null,
      input.thumbnailKey ?? null,
      now,
    )
    .run();
}

export async function publishItem(db: Db, id: string, ownerUserId: string) {
  const now = toDbNow();
  const res = await db.prepare('UPDATE items SET visibility = "public", publishedAt = ?1, updatedAt = ?1 WHERE id = ?2 AND ownerUserId = ?3 AND deletedAt IS NULL')
    .bind(now, id, ownerUserId)
    .run();
  return res.success && res.meta.changes > 0;
}

export async function deleteItem(db: Db, id: string, ownerUserId: string) {
  const now = toDbNow();
  const res = await db.prepare('UPDATE items SET deletedAt = ?1, updatedAt = ?1 WHERE id = ?2 AND ownerUserId = ?3 AND deletedAt IS NULL')
    .bind(now, id, ownerUserId)
    .run();
  return res.success && res.meta.changes > 0;
}

export async function getItemById(db: Db, id: string) {
  return await db.prepare('SELECT * FROM items WHERE id = ?1 AND deletedAt IS NULL').bind(id).first();
}

export interface ListItemsParams {
  page: number;
  pageSize: number;
  q?: string | null;
  category?: Category | null;
  tag?: string | null; // tag slug
  sort?: 'popular' | 'new';
}

export async function listPublicItems(db: Db, params: ListItemsParams) {
  const { page, pageSize, q, category, tag, sort } = params;
  const offset = (page - 1) * pageSize;
  const conds: string[] = ['i.visibility = "public"', 'i.deletedAt IS NULL'];
  const binds: any[] = [];
  if (category) {
    conds.push('i.category = ?');
    binds.push(category);
  }
  if (q) {
    conds.push('(i.title LIKE ? OR i.description LIKE ?)');
    binds.push(`%${q}%`, `%${q}%`);
  }
  let join = '';
  if (tag) {
    join = 'INNER JOIN item_tags it ON it.itemId = i.id AND it.tagId = ?';
    binds.push(tag);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const orderBy = sort === 'popular' ? 'ORDER BY i.downloadCount DESC' : 'ORDER BY i.publishedAt DESC';

  const items = await db.prepare(`SELECT i.* FROM items i ${join} ${where} ${orderBy} LIMIT ? OFFSET ?`)
    .bind(...binds, pageSize, offset)
    .all();
  const totalRow = await db.prepare(`SELECT COUNT(*) as cnt FROM items i ${join} ${where}`)
    .bind(...binds)
    .first<{ cnt: number }>();
  return { items: items.results ?? [], total: (totalRow?.cnt as number) ?? 0, page, pageSize };
}



