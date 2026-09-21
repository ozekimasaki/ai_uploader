import type { Env, ItemRow, SupabaseUser } from '../env';
import { CATEGORIES } from '../env';
import { ensureTables, fetchItem, loadTagsForItem, loadTagsForItems, normalizeItemRow } from '../lib/db';
import { json, jsonError } from '../lib/http';
import { createDownloadToken, enforceRateLimitByDo } from '../lib/rate-limit';
import { escapeLike, extractExt, inferExtFromContentType, isAllowedByConfig, parseTags, slugify, toInt } from '../lib/util';

const MULTIPART_PREFIX = 'uploads';
const PAGE_SIZE = 20;

type ItemWithTags = ItemRow & { tags: string[] };

export async function listItemsApi(env: Env, url: URL): Promise<Response> {
  try {
    await ensureTables(env);
  } catch {}
  try {
    const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
    const q = String(url.searchParams.get('q') || '').trim();
    const categoryParam = String(url.searchParams.get('category') || '').trim().toUpperCase();
    const tagParam = String(url.searchParams.get('tag') || '').trim();
    const sort = String(url.searchParams.get('sort') || 'new').trim();
    const whereParts: string[] = ["visibility = 'public'"];
    const binds: unknown[] = [];
    if (categoryParam && (CATEGORIES as readonly string[]).includes(categoryParam)) {
      whereParts.push('UPPER(category) = ?');
      binds.push(categoryParam);
    }
    if (q) {
      const like = `%${escapeLike(q)}%`;
      whereParts.push("(title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR id IN (SELECT it.itemId FROM item_tags it JOIN tags t ON t.id = it.tagId WHERE t.label LIKE ? ESCAPE '\\' OR t.id LIKE ? ESCAPE '\\'))");
      binds.push(like, like, like, like);
    }
    if (tagParam) {
      whereParts.push('id IN (SELECT it.itemId FROM item_tags it JOIN tags t ON t.id = it.tagId WHERE t.id = ? OR t.label = ?)');
      binds.push(tagParam, tagParam);
    }
    let orderBy = "COALESCE(createdAt, created_at, '') DESC, rowid DESC";
    if (sort === 'popular') orderBy = "COALESCE(downloadCount, 0) DESC, COALESCE(createdAt, created_at, '') DESC, rowid DESC";
    const limit = PAGE_SIZE + 1;
    const offset = (page - 1) * PAGE_SIZE;
    const res = await env.DB.prepare(`SELECT * FROM items WHERE ${whereParts.join(' AND ')} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
      .bind(...binds, limit, offset)
      .all();
    const rows = res.results ?? [];
    const hasNext = rows.length > PAGE_SIZE;
    let items: ItemWithTags[] = rows.slice(0, PAGE_SIZE).map((r) => ({ ...normalizeItemRow(r as Record<string, unknown>), tags: [] as string[] }));
    try {
      const tagMap = await loadTagsForItems(env, items.map((it) => it.id));
      items = items.map((it) => ({ ...it, tags: tagMap[it.id] ?? [] }));
    } catch {}
    return json({ page, hasNext, items });
  } catch (e) {
    return jsonError('internal', 500, { message: String((e as Error)?.message || e) });
  }
}

export async function getItemApi(env: Env, id: string, user: SupabaseUser): Promise<Response> {
  try {
    await ensureTables(env);
  } catch {}
  try {
    const it = await fetchItem(env, id);
    if (!it) return jsonError('not_found', 404);
    const viewerId = String(user.id || '');
    if (String(it.visibility).toLowerCase() === 'private' && (!viewerId || viewerId !== it.ownerUserId)) {
      return jsonError('not_found', 404);
    }
    const tags = await loadTagsForItem(env, it.id).catch(() => [] as string[]);
    return json({ item: { ...it, tags } });
  } catch (e) {
    return jsonError('internal', 500, { message: String((e as Error)?.message || e) });
  }
}

export async function createItemApi(req: Request, env: Env, user: SupabaseUser): Promise<Response> {
  try {
    await ensureTables(env);
  } catch {}
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const title = String(body?.title || '').trim();
    const category = String(body?.category || '').trim().toUpperCase();
    const visibility = String(body?.visibility || 'private').trim().toLowerCase() === 'public' ? 'public' : 'private';
    const description = String(body?.description || '').trim();
    const prompt = String(body?.prompt || '').trim();
    const tagsInputRaw = Array.isArray(body?.tags) ? String((body.tags as unknown[]).join(',')) : String(body?.tags || '');
    const fileKeyIn = String(body?.fileKey || body?.preuploadedKey || '').trim();
    const originalName = String(body?.originalFilename || body?.filename || '').trim();
    const contentTypeIn = String(body?.contentType || '').trim() || 'application/octet-stream';
    const sha256Hex = String(body?.sha256 || '').trim();
    const sizeBytes = Number(body?.sizeBytes || 0);
    if (!title) return jsonError('bad_request', 400, { message: 'title required' });
    if (!(CATEGORIES as readonly string[]).includes(category)) return jsonError('bad_request', 400, { message: 'invalid category' });
    if (!fileKeyIn) return jsonError('bad_request', 400, { message: 'fileKey required' });
    // 所有していない staging キーの登録を防止
    const uid = String(user.id || '');
    if (!fileKeyIn.startsWith(`${MULTIPART_PREFIX}/${uid}/`) || fileKeyIn.includes('..')) {
      return jsonError('forbidden', 403, { message: 'fileKey must be your own upload' });
    }
    const srcExt = extractExt(fileKeyIn) || extractExt(originalName) || (inferExtFromContentType(contentTypeIn) ? '.' + inferExtFromContentType(contentTypeIn) : '');
    const extNoDot = (srcExt || '').slice(1).toLowerCase() || inferExtFromContentType(contentTypeIn);
    if (!isAllowedByConfig(extNoDot, contentTypeIn, env)) {
      return jsonError('unsupported_type', 400);
    }
    const maxMb = toInt(env.MAX_FILE_SIZE_MB, 2048);
    if (Number.isFinite(maxMb) && sizeBytes / (1024 * 1024) > maxMb) {
      return jsonError('bad_request', 400, { message: `file too large (max ${maxMb}MB)` });
    }
    // R2 上に実在することを確認
    const head = await env.R2.head(fileKeyIn).catch(() => null);
    if (!head) return jsonError('bad_request', 400, { message: 'file not found in storage' });

    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO items (id, ownerUserId, title, category, visibility, description, prompt,
        original_filename, size_bytes, file_key, sha256, contentType, extension, thumbnail_key,
        published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id, uid, title, category, visibility, description, prompt,
        originalName, Number.isFinite(sizeBytes) ? sizeBytes : 0, fileKeyIn, sha256Hex || null, contentTypeIn,
        (srcExt || '').slice(1), String(body?.thumbnailKey || '') || null,
        visibility === 'public' ? nowIso : null, nowIso, nowIso,
      )
      .run();
    const tags = parseTags(tagsInputRaw);
    if (tags.length) {
      for (const label of tags) {
        const slug = slugify(label);
        await env.DB.prepare('INSERT OR IGNORE INTO tags (id, label, created_at) VALUES (?, ?, ?)').bind(slug, label, nowIso).run();
        await env.DB.prepare('INSERT OR IGNORE INTO item_tags (itemId, tagId) VALUES (?, ?)').bind(id, slug).run();
      }
    }
    return json({ ok: true, id, path: `/items/${id}` });
  } catch (e) {
    return jsonError('internal', 500, { message: String((e as Error)?.message || e) });
  }
}

export async function publishItemApi(req: Request, env: Env, id: string, user: SupabaseUser): Promise<Response> {
  try {
    await ensureTables(env);
    const it = await fetchItem(env, id);
    if (!it) return jsonError('not_found', 404);
    const uid = String(user.id || '');
    if (!uid || it.ownerUserId !== uid) return jsonError('forbidden', 403);
    const body = (await req.json().catch(() => ({}))) as { visibility?: string };
    const toPublic = String(body?.visibility || 'public').toLowerCase() !== 'private';
    const nowIso = new Date().toISOString();
    if (toPublic) {
      await env.DB.prepare("UPDATE items SET visibility = 'public', published_at = ?, updated_at = ? WHERE id = ?").bind(nowIso, nowIso, id).run();
    } else {
      await env.DB.prepare("UPDATE items SET visibility = 'private', published_at = NULL, updated_at = ? WHERE id = ?").bind(nowIso, id).run();
    }
    return json({ ok: true, id, visibility: toPublic ? 'public' : 'private', publishedAt: toPublic ? nowIso : null });
  } catch (e) {
    return jsonError('internal', 500, { message: String((e as Error)?.message || e) });
  }
}

export async function deleteItemApi(env: Env, id: string, user: SupabaseUser): Promise<Response> {
  try {
    await ensureTables(env);
    const it = await fetchItem(env, id);
    if (!it) return jsonError('not_found', 404);
    const uid = String(user.id || '');
    if (!uid || it.ownerUserId !== uid) return jsonError('forbidden', 403);

    // R2 オブジェクト削除（file_key のディレクトリ配下 + 明示キー）
    const keys = new Set<string>();
    if (it.fileKey) keys.add(it.fileKey);
    if (it.thumbnailKey) keys.add(it.thumbnailKey);
    const dir = it.fileKey ? it.fileKey.split('/').slice(0, -1).join('/') + '/' : `items/${id}/`;
    try {
      const listing = await env.R2.list({ prefix: dir });
      for (const o of listing.objects) keys.add(o.key);
    } catch {}
    for (const k of keys) {
      try {
        await env.R2.delete(k);
      } catch {}
    }

    try {
      await env.DB.prepare('DELETE FROM item_tags WHERE itemId = ?').bind(id).run();
    } catch {}
    await env.DB.prepare('DELETE FROM items WHERE id = ?').bind(id).run();
    return json({ ok: true, id });
  } catch (e) {
    return jsonError('internal', 500, { message: String((e as Error)?.message || e) });
  }
}

function rateLimitedResp(resetAt: number, scope: string): Response {
  const retrySec = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  const h = new Headers({ 'content-type': 'application/json', 'retry-after': String(retrySec) });
  return jsonError('rate_limited', 429, { scope, resetAt }, h);
}

export async function downloadUrlApi(req: Request, env: Env, url: URL, id: string, user: SupabaseUser): Promise<Response> {
  const userId = String(user.id || '');
  try {
    await ensureTables(env);
    const it = await fetchItem(env, id);
    if (!it) return jsonError('not_found', 404);
    const canDownload = String(it.visibility).toLowerCase() === 'public' || (it.ownerUserId && it.ownerUserId === userId);
    if (!canDownload) return jsonError('forbidden', 403);
    if (!it.fileKey) return jsonError('bad_item', 400);

    // レート制御: item+user+ip → user → global の順
    const ip = req.headers.get('cf-connecting-ip') || '0.0.0.0';
    const windowSec = 60;
    const perKey = toInt(env.RATE_LIMIT_DOWNLOAD_PER_MINUTE, 10);
    const r1 = await enforceRateLimitByDo(`rate:${id}:${userId}:${ip}`, windowSec, perKey, env);
    if (!r1.allowed) return rateLimitedResp(r1.resetAt, 'item');
    const perUser = toInt(env.RATE_LIMIT_DOWNLOAD_PER_USER_PER_MINUTE, 5);
    if (perUser > 0) {
      const r2 = await enforceRateLimitByDo(`rate-user:${userId}`, windowSec, perUser, env);
      if (!r2.allowed) return rateLimitedResp(r2.resetAt, 'user');
    }
    const perGlobal = toInt(env.RATE_LIMIT_GLOBAL_DOWNLOAD_PER_MINUTE, 100);
    if (perGlobal > 0) {
      const r3 = await enforceRateLimitByDo('rate-global', windowSec, perGlobal, env);
      if (!r3.allowed) return rateLimitedResp(r3.resetAt, 'global');
    }

    const bodyIn = (await req.json().catch(() => ({}))) as { ttlMinutes?: number };
    const wantTtlMin = Math.max(1, Number(bodyIn?.ttlMinutes || env.DEFAULT_DOWNLOAD_TTL_MINUTES || 15));
    const ttlMin = Math.min(wantTtlMin, toInt(env.MAX_DOWNLOAD_TTL_MINUTES, 120));
    const expireAtMs = Date.now() + ttlMin * 60 * 1000;

    const token = crypto.randomUUID().replace(/-/g, '');
    try {
      await createDownloadToken(token, { itemId: id, userId, fileKey: it.fileKey, expireAtMs, oneTime: true }, env);
    } catch {}

    const u = new URL('/api/file', url.origin);
    u.searchParams.set('t', token);
    u.searchParams.set('download', '1');
    if (it.originalFilename) u.searchParams.set('name', it.originalFilename);
    return json({ url: u.pathname + '?' + u.searchParams.toString(), ttlMinutes: ttlMin });
  } catch (e) {
    return jsonError('internal', 500, { message: String((e as Error)?.message || e) });
  }
}

export async function createReportApi(req: Request, env: Env, user: SupabaseUser): Promise<Response> {
  const uid = String(user.id || '');
  try {
    await ensureTables(env);
    const body = (await req.json().catch(() => ({}))) as { itemId?: string; reason?: string };
    const itemId = String(body?.itemId || '').trim();
    const reason = String(body?.reason || '').trim().slice(0, 1000);
    if (!itemId) return jsonError('bad_request', 400);
    const it = await fetchItem(env, itemId);
    if (!it) return jsonError('not_found', 404);
    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    await env.DB.prepare("INSERT INTO reports (id, itemId, reporterUserId, reason, createdAt, status) VALUES (?, ?, ?, ?, ?, 'open')")
      .bind(id, itemId, uid, reason, nowIso)
      .run();
    let notified = false;
    let notifyStatus = 0;
    const hook = (env.DISCORD_WEBHOOK_URL || '').trim();
    if (hook) {
      const origin = new URL(req.url).origin;
      const itemUrl = `${origin}/items/${encodeURIComponent(itemId)}`;
      const payload = {
        username: 'AI Uploader',
        content: '🚨 新しい通報',
        embeds: [
          {
            title: 'Report',
            description: (reason || '(なし)').slice(0, 1000),
            color: 0xffaa00,
            fields: [
              { name: 'Item', value: `[${itemId}](${itemUrl})`, inline: false },
              { name: 'Reporter', value: uid, inline: true },
              { name: 'Time', value: nowIso, inline: true },
            ],
          },
        ],
      };
      try {
        const resp = await fetch(hook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
        notifyStatus = resp.status;
        notified = resp.ok || resp.status === 204;
      } catch {}
    }
    return json({ ok: true, id, notified, notifyStatus });
  } catch (e) {
    return jsonError('internal', 500, { message: String((e as Error)?.message || e) });
  }
}
