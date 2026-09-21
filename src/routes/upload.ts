import type { Env, SupabaseUser } from '../env';
import { CATEGORIES } from '../env';
import { getAuthUser } from '../lib/auth';
import { ensureTables } from '../lib/db';
import { json, jsonError } from '../lib/http';
import { enforceRateLimitByDo } from '../lib/rate-limit';
import { extractExt, inferExtFromContentType, isAllowedByConfig, parseTags, slugify, toInt } from '../lib/util';
import { errorPage } from '../views/layout';

const MULTIPART_PREFIX = 'uploads';

/** マルチパートの staging キーは `uploads/{uid}/...` — 呼び出しユーザー所有か検証する */
function ownedUploadKey(uid: string, key: string): boolean {
  return !!uid && key.startsWith(`${MULTIPART_PREFIX}/${uid}/`) && !key.includes('..');
}

async function limitUploadPerHour(uid: string, env: Env): Promise<Response | null> {
  const perHour = Math.max(1, toInt(env.RATE_LIMIT_UPLOAD_PER_HOUR, 50));
  const r = await enforceRateLimitByDo(`upl:${uid}`, 3600, perHour, env);
  if (!r.allowed) {
    const h = new Headers({ 'content-type': 'application/json' });
    if (r.resetAt) h.set('retry-after', String(Math.max(1, Math.ceil((r.resetAt - Date.now()) / 1000))));
    return jsonError('rate_limited', 429, { scope: 'upload_per_user_per_hour', resetAt: r.resetAt }, h);
  }
  return null;
}

export async function uploadMultipartInit(req: Request, env: Env, user: SupabaseUser): Promise<Response> {
  const uid = String(user.id || '');
  const limited = await limitUploadPerHour(uid, env);
  if (limited) return limited;
  try {
    const body = (await req.json().catch(() => ({}))) as { filename?: string; contentType?: string };
    const filename = String(body?.filename || '').trim();
    const contentType = String(body?.contentType || 'application/octet-stream');
    if (!filename) return jsonError('bad_request', 400, { message: 'filename required' });
    const ext = extractExt(filename);
    const extNoDot = ext ? ext.slice(1).toLowerCase() : '';
    if (!isAllowedByConfig(extNoDot || inferExtFromContentType(contentType), contentType, env)) {
      return jsonError('unsupported_type', 400);
    }
    const id = crypto.randomUUID();
    const key = `${MULTIPART_PREFIX}/${uid}/${id}/source${ext || ''}`;
    const mpu = await env.R2.createMultipartUpload(key, { httpMetadata: { contentType } });
    const partSizeBytes = 10 * 1024 * 1024; // 10MiB
    return json({ id, key, uploadId: mpu.uploadId, partSizeBytes });
  } catch (e) {
    return jsonError('init_failed', 500, { message: String((e as Error)?.message || e) });
  }
}

export async function uploadMultipartPart(req: Request, env: Env, url: URL, user: SupabaseUser): Promise<Response> {
  try {
    const uid = String(user.id || '');
    const key = url.searchParams.get('key') || '';
    const uploadId = url.searchParams.get('uploadId') || '';
    const partNumber = Number(url.searchParams.get('partNumber') || '0');
    if (!key || !uploadId || !partNumber) return jsonError('bad_request', 400);
    if (!ownedUploadKey(uid, key)) return jsonError('forbidden', 403);
    if (!req.body) return jsonError('bad_request', 400);
    const mpu = env.R2.resumeMultipartUpload(key, uploadId);
    const res = await mpu.uploadPart(partNumber, req.body);
    return json({ etag: res.etag });
  } catch (e) {
    return jsonError('part_failed', 500, { message: String((e as Error)?.message || e) });
  }
}

export async function uploadMultipartComplete(req: Request, env: Env, user: SupabaseUser): Promise<Response> {
  try {
    const uid = String(user.id || '');
    const body = (await req.json().catch(() => ({}))) as { key?: string; uploadId?: string; parts?: { partNumber: number; etag: string }[] };
    const key = String(body?.key || '');
    const uploadId = String(body?.uploadId || '');
    const partsIn = Array.isArray(body?.parts) ? body.parts : [];
    if (!key || !uploadId || !partsIn.length) return jsonError('bad_request', 400);
    if (!ownedUploadKey(uid, key)) return jsonError('forbidden', 403);
    const parts = partsIn.map((p) => ({ partNumber: Number(p.partNumber), etag: String(p.etag) }));
    const mpu = env.R2.resumeMultipartUpload(key, uploadId);
    await mpu.complete(parts);
    return json({ ok: true });
  } catch (e) {
    return jsonError('complete_failed', 500, { message: String((e as Error)?.message || e) });
  }
}

export async function uploadMultipartAbort(req: Request, env: Env, user: SupabaseUser): Promise<Response> {
  try {
    const uid = String(user.id || '');
    const body = (await req.json().catch(() => ({}))) as { key?: string; uploadId?: string };
    const key = String(body?.key || '');
    const uploadId = String(body?.uploadId || '');
    if (!key || !uploadId) return jsonError('bad_request', 400);
    if (!ownedUploadKey(uid, key)) return jsonError('forbidden', 403);
    const mpu = env.R2.resumeMultipartUpload(key, uploadId);
    await mpu.abort();
    return json({ ok: true });
  } catch (e) {
    return jsonError('abort_failed', 500, { message: String((e as Error)?.message || e) });
  }
}

interface ItemInsert {
  id: string;
  ownerUserId: string;
  title: string;
  category: string;
  visibility: string;
  description: string;
  prompt: string;
  originalFilename: string;
  sizeBytes: number;
  fileKey: string;
  sha256: string | null;
  contentType: string;
  extension: string;
  thumbnailKey: string | null;
  publishedAt: string | null;
  nowIso: string;
}

/** ensureTables で保証された正規カラムへ挿入する */
async function insertItem(env: Env, v: ItemInsert): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO items (id, ownerUserId, title, category, visibility, description, prompt,
      original_filename, size_bytes, file_key, sha256, contentType, extension, thumbnail_key,
      published_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      v.id, v.ownerUserId, v.title, v.category, v.visibility, v.description, v.prompt,
      v.originalFilename, v.sizeBytes, v.fileKey, v.sha256, v.contentType, v.extension, v.thumbnailKey,
      v.publishedAt, v.nowIso, v.nowIso,
    )
    .run();
}

async function upsertTags(env: Env, itemId: string, tagsInput: string, nowIso: string): Promise<void> {
  const tags = parseTags(tagsInput);
  if (!tags.length) return;
  let tagCreatedCol: string | undefined;
  try {
    const tinfo = await env.DB.prepare('PRAGMA table_info(tags)').all();
    const tnames = new Set((tinfo.results ?? []).map((r) => String((r as Record<string, unknown>).name ?? '').toLowerCase()));
    if (tnames.has('created_at')) tagCreatedCol = 'created_at';
    else if (tnames.has('createdat')) tagCreatedCol = 'createdAt';
  } catch {}
  for (const label of tags) {
    const slug = slugify(label);
    if (tagCreatedCol) {
      await env.DB.prepare(`INSERT OR IGNORE INTO tags (id, label, ${tagCreatedCol}) VALUES (?, ?, ?)`).bind(slug, label, nowIso).run();
    } else {
      await env.DB.prepare('INSERT OR IGNORE INTO tags (id, label) VALUES (?, ?)').bind(slug, label).run();
    }
    await env.DB.prepare('INSERT OR IGNORE INTO item_tags (itemId, tagId) VALUES (?, ?)').bind(itemId, slug).run();
  }
}

export async function uploadForm(req: Request, env: Env, url: URL): Promise<Response> {
  const authed = await getAuthUser(req, env).catch(() => null);
  const uid = String(authed?.id || '');
  if (!authed || !uid) {
    if ((req.headers.get('accept') || '').includes('application/json')) return jsonError('unauthorized', 401);
    return errorPage(env, 'エラー', 'ログインが必要です。', 401);
  }
  const limited = await limitUploadPerHour(uid, env);
  if (limited) return limited;
  const wantsJson = (req.headers.get('accept') || '').includes('application/json');
  const errRes = (msg: string, status = 400) =>
    wantsJson ? jsonError('bad_request', status, { message: msg }) : errorPage(env, 'エラー', msg, status, { isLoggedIn: true });

  try {
    await ensureTables(env);
    const form = await req.formData();
    const preuploadedKey = String(form.get('preuploadedKey') || '').trim();
    const file = form.get('file');
    if (!preuploadedKey && (!(file instanceof File) || file.size === 0)) {
      return errRes('ファイルは必須です。');
    }
    // preuploadedKey は呼び出しユーザーの staging 領域に限定（IDOR 対策）
    if (preuploadedKey && !ownedUploadKey(uid, preuploadedKey)) {
      return errRes('アップロード済みキーが無効です。', 403);
    }

    const title = String(form.get('title') || '').trim();
    const category = String(form.get('category') || '').trim().toUpperCase();
    const visibility = String(form.get('visibility') || 'private').trim().toLowerCase() === 'public' ? 'public' : 'private';
    const description = String(form.get('description') || '').trim();
    const prompt = String(form.get('prompt') || '').trim();
    const tagsInput = String(form.get('tags') || '').trim();
    const thumbnail = form.get('thumbnail');

    if (!title) return errRes('タイトルは必須です。');
    if (!(CATEGORIES as readonly string[]).includes(category)) return errRes('カテゴリーが不正です。');

    const maxMb = toInt(env.MAX_FILE_SIZE_MB, 2048);
    const sizeBytes = preuploadedKey ? Number(form.get('sizeBytes') || 0) : Number((file as File).size || 0);
    if (Number.isFinite(maxMb) && sizeBytes / (1024 * 1024) > maxMb) {
      return errRes(`ファイルサイズが上限(${maxMb}MB)を超えています。`);
    }

    const id = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    let mainKey = preuploadedKey;
    let contentType: string;
    let srcExt: string;
    if (preuploadedKey) {
      contentType = String(form.get('contentType') || 'application/octet-stream');
      srcExt = extractExt(preuploadedKey);
    } else {
      const f = file as File;
      srcExt = extractExt(f.name || '');
      contentType = f.type || 'application/octet-stream';
      mainKey = `${MULTIPART_PREFIX}/${uid}/${id}/source${srcExt}`;
    }
    const extNoDot = (srcExt || '').slice(1).toLowerCase() || inferExtFromContentType(contentType);
    if (!isAllowedByConfig(extNoDot, contentType, env)) {
      return errRes('許可されていないファイル種別です。');
    }
    if (!preuploadedKey && file instanceof File) {
      await env.R2.put(mainKey, file.stream(), { httpMetadata: { contentType } });
    }

    let thumbKey = '';
    if (thumbnail instanceof File && thumbnail.size > 0) {
      thumbKey = `${MULTIPART_PREFIX}/${uid}/${id}/thumb${extractExt(thumbnail.name || '')}`;
      await env.R2.put(thumbKey, thumbnail.stream(), { httpMetadata: { contentType: thumbnail.type || 'image/png' } });
    }

    const originalName = preuploadedKey ? String(form.get('filename') || '') : (file as File).name || '';
    const sha256Hex = String(form.get('sha256') || '').trim();
    await insertItem(env, {
      id,
      ownerUserId: uid,
      title,
      category,
      visibility,
      description,
      prompt,
      originalFilename: originalName,
      sizeBytes,
      fileKey: mainKey,
      sha256: sha256Hex || null,
      contentType,
      extension: srcExt ? srcExt.slice(1) : '',
      thumbnailKey: thumbKey || null,
      publishedAt: visibility === 'public' ? nowIso : null,
      nowIso,
    });
    await upsertTags(env, id, tagsInput, nowIso);

    if (wantsJson) {
      return json({ ok: true, id, path: `/items/${id}` });
    }
    return Response.redirect(new URL(`/items/${id}`, url.origin), 303);
  } catch (e) {
    const isDev = String(env.ENVIRONMENT || '').toLowerCase() === 'development';
    const msg = isDev ? String((e as Error)?.message || e) : '登録に失敗しました。しばらくしてから再試行してください。';
    return errRes(msg, 500);
  }
}
