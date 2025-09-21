export interface EnvBindings {
  ENVIRONMENT: 'development' | 'production' | string;
  DEFAULT_DOWNLOAD_TTL_MINUTES: number;
  MAX_DOWNLOAD_TTL_MINUTES: number;
  RATE_LIMIT_DOWNLOAD_PER_MINUTE: number;
  RATE_LIMIT_UPLOAD_PER_HOUR: number;
  RATE_LIMIT_DOWNLOAD_PER_USER_PER_MINUTE: number;
  RATE_LIMIT_GLOBAL_DOWNLOAD_PER_MINUTE: number;
  MAX_FILE_SIZE_MB: number;
  ALLOWED_FILE_TYPES: string;
  SUPABASE_URL: string;
  R2_BUCKET: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  DB: D1Database;
  R2: R2Bucket;
  RATE_LIMITER_DO: DurableObjectNamespace;
  ASSETS: Fetcher;
}

type Method = 'GET' | 'POST' | 'DELETE' | 'OPTIONS';

const json = (data: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(data), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
      ...init.headers,
    },
    status: init.status ?? 200,
  });

const text = (body: string, init: ResponseInit = {}): Response =>
  new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
      ...init.headers,
    },
    status: init.status ?? 200,
  });

const notFound = () => json({ error: 'Not Found' }, { status: 404 });
const methodNotAllowed = () => json({ error: 'Method Not Allowed' }, { status: 405 });

export default {
  async fetch(request: Request, env: EnvBindings, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'content-type, authorization',
          'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
        },
      });
    }

    // API routes
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env, ctx);
    }

    // Redirect root to /items (alias)
    if (url.pathname === '/') {
      return Response.redirect(new URL('/items', url).toString(), 302);
    }

    // Fallback to static assets (Vite dist). If 404, serve index.html for SPA routing
    const assetRes = await env.ASSETS.fetch(request);
    if (assetRes.status === 404 && request.method === 'GET') {
      const indexUrl = new URL('/index.html', url.origin);
      return env.ASSETS.fetch(new Request(indexUrl.toString(), request));
    }
    return assetRes;
  },
} satisfies ExportedHandler<EnvBindings>;

import { requireUser, getUserOrNull } from './auth';
import { listPublicItems, VALID_CATEGORIES, type Category, createItem, ensureUser, getItemById, publishItem, deleteItem } from './db';
export { RateLimiter } from './rateLimiter';
import { presignUrl, createMultipartUpload, buildUploadPartUrl, completeMultipartUpload } from './r2_signing';

async function handleApi(request: Request, env: EnvBindings, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  // Simple path params matcher
  const match = (pattern: RegExp) => pattern.exec(pathname);

  // GET /api/items
  if (request.method === 'GET' && pathname === '/api/items') {
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
    const q = url.searchParams.get('q');
    const tag = url.searchParams.get('tag');
    const cat = url.searchParams.get('category') as Category | null;
    const sort = (url.searchParams.get('sort') as 'popular' | 'new' | null) ?? 'new';
    if (cat && !VALID_CATEGORIES.includes(cat)) {
      return json({ error: 'Invalid category' }, { status: 400 });
    }
    const pageSize = 20;
    const data = await listPublicItems(env.DB, { page, pageSize, q, tag, category: cat ?? null, sort });
    return json(data);
  }

  // GET /api/items/:id
  {
    const m = match(/^\/api\/items\/([A-Za-z0-9_-]+)$/);
    if (request.method === 'GET' && m) {
      const id = m[1];
      const item = await getItemById(env.DB, id);
      if (!item) return notFound();
      const me = await getUserOrNull(request, env);
      if (item.visibility !== 'public') {
        if (!me || me.id !== item.ownerUserId) return new Response(null, { status: 403 });
      }
      return json({ item });
    }
  }

  // POST /api/items
  if (request.method === 'POST' && pathname === '/api/items') {
    const me = await requireUser(request, env);
    await ensureUser(env.DB, me.id);
    const body = (await safeJson(request)) as any;
    const required = ['title', 'category', 'fileKey', 'originalFilename', 'contentType', 'sizeBytes'];
    for (const k of required) {
      if (body[k] === undefined || body[k] === null) return json({ error: `Missing field: ${k}` }, { status: 400 });
    }
    const category = String(body.category).toUpperCase();
    if (!VALID_CATEGORIES.includes(category)) return json({ error: 'Invalid category' }, { status: 400 });
    if (Number(body.sizeBytes) > env.MAX_FILE_SIZE_MB * 1024 * 1024) return json({ error: 'File too large' }, { status: 400 });

    const id = crypto.randomUUID();
    await createItem(env.DB, {
      id,
      ownerUserId: me.id,
      title: String(body.title),
      category: category as any,
      description: body.description ? String(body.description) : null,
      prompt: body.prompt ? String(body.prompt) : null,
      fileKey: String(body.fileKey),
      originalFilename: String(body.originalFilename),
      contentType: String(body.contentType),
      sizeBytes: Number(body.sizeBytes),
      sha256: body.sha256 ? String(body.sha256) : null,
      extension: body.extension ? String(body.extension) : null,
      thumbnailKey: body.thumbnailKey ? String(body.thumbnailKey) : null,
    });
    return json({ id }, { status: 201 });
  }

  // POST /api/items/:id/publish
  {
    const m = match(/^\/api\/items\/([A-Za-z0-9_-]+)\/publish$/);
    if (request.method === 'POST' && m) {
      const me = await requireUser(request, env);
      const id = m[1];
      const ok = await publishItem(env.DB, id, me.id);
      if (!ok) return json({ error: 'Not found or not owner' }, { status: 404 });
      return json({ id, published: true });
    }
  }

  // DELETE /api/items/:id
  {
    const m = match(/^\/api\/items\/([A-Za-z0-9_-]+)$/);
    if (request.method === 'DELETE' && m) {
      const me = await requireUser(request, env);
      const id = m[1];
      const ok = await deleteItem(env.DB, id, me.id);
      if (!ok) return json({ error: 'Not found or not owner' }, { status: 404 });
      return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*' } });
    }
  }

  // POST /api/upload/presign (stub)
  if (request.method === 'POST' && pathname === '/api/upload/presign') {
    const me = await requireUser(request, env);
    const body = await safeJson(request);
    const sizeBytes = Number(body.sizeBytes ?? 0);
    const originalFilename = String(body.originalFilename ?? 'file');
    const contentType = String(body.contentType ?? 'application/octet-stream');
    if (!sizeBytes || sizeBytes <= 0) return json({ error: 'Invalid sizeBytes' }, { status: 400 });
    const max = env.MAX_FILE_SIZE_MB * 1024 * 1024;
    if (sizeBytes > max) return json({ error: 'File too large' }, { status: 400 });

    const ext = (originalFilename.split('.').pop() || '').toLowerCase();
    if (!isAllowedExtension(env, ext)) return json({ error: 'File type not allowed' }, { status: 400 });
    const key = generateFileKey(me.id, ext);

    const creds = getR2Creds(env);
    const bucket = env.R2_BUCKET;

    const multipart = Boolean(body.multipart) || sizeBytes > 5 * 1024 * 1024; // >5MB -> multipart
    if (!multipart) {
      const urlSigned = await presignUrl(creds, {
        method: 'PUT',
        bucket,
        key,
        expiresSeconds: env.DEFAULT_DOWNLOAD_TTL_MINUTES * 60,
      });
      return json({ mode: 'single', key, url: urlSigned, expiresSeconds: env.DEFAULT_DOWNLOAD_TTL_MINUTES * 60 });
    }

    const partSize = Math.max(5 * 1024 * 1024, Number(body.partSizeBytes ?? 10 * 1024 * 1024));
    const partsCount = Math.ceil(sizeBytes / partSize);
    const uploadId = await createMultipartUpload(creds, bucket, key, contentType);
    const urls: string[] = [];
    const expiresSeconds = 60 * 30; // 30min for each part URL
    for (let i = 1; i <= partsCount; i++) {
      const u = await buildUploadPartUrl(creds, bucket, key, uploadId, i, expiresSeconds);
      urls.push(await u);
    }
    return json({ mode: 'multipart', key, uploadId, partSizeBytes: partSize, partsCount, urls, expiresSeconds });
  }

  // POST /api/items/:id/download-url (stub)
  {
    const m = match(/^\/api\/items\/([A-Za-z0-9_-]+)\/download-url$/);
    if (request.method === 'POST' && m) {
      const me = await requireUser(request, env);
      const id = m[1];
      const item = await getItemById(env.DB, id);
      if (!item) return notFound();
      if (item.visibility !== 'public' && item.ownerUserId !== me.id) return new Response(null, { status: 403 });
      const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';
      const ok = await enforceDownloadRateLimit(env, { userId: me.id, itemId: id, ip });
      if (!ok) return json({ error: 'Too Many Requests' }, { status: 429 });

      const ttlRequested = Number((await safeJson(request))?.ttlMinutes ?? env.DEFAULT_DOWNLOAD_TTL_MINUTES);
      const ttlMinutes = clamp(ttlRequested, 1, env.MAX_DOWNLOAD_TTL_MINUTES);
      const creds = getR2Creds(env);
      const urlSigned = await presignUrl(creds, {
        method: 'GET',
        bucket: env.R2_BUCKET,
        key: String(item.fileKey),
        expiresSeconds: ttlMinutes * 60,
      });
      return json({ id, url: urlSigned, ttlMinutes });
    }
  }

  // POST /api/upload/complete (multipart)
  if (request.method === 'POST' && pathname === '/api/upload/complete') {
    const me = await requireUser(request, env);
    const body = await safeJson(request);
    const key = String(body.key || '');
    const uploadId = String(body.uploadId || '');
    const parts = (body.parts || []) as Array<{ partNumber: number; etag: string }>;
    if (!key || !uploadId || !Array.isArray(parts) || parts.length === 0) return json({ error: 'Invalid payload' }, { status: 400 });
    // Basic ownership check: ensure the key prefix matches user id
    if (!key.startsWith(`${me.id}/`)) return new Response(null, { status: 403 });
    const creds = getR2Creds(env);
    await completeMultipartUpload(creds, env.R2_BUCKET, key, uploadId, parts);
    return json({ ok: true });
  }

  // POST /api/reports
  if (request.method === 'POST' && pathname === '/api/reports') {
    const body = await safeJson(request);
    return json({ id: crypto.randomUUID(), ...body }, { status: 201 });
  }

  // Alias: GET /items -> serve SPA index (handled by assets fallback), provide minimal JSON if explicitly requested
  if (request.method === 'GET' && pathname === '/items' && request.headers.get('accept')?.includes('application/json')) {
    return json({ items: [] });
  }

  return notFound();
}

async function safeJson(request: Request): Promise<any> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function isAllowedExtension(env: EnvBindings, ext: string): boolean {
  if (!ext) return false;
  const allowed = env.ALLOWED_FILE_TYPES.split(',').map(s => s.trim().toLowerCase());
  return allowed.includes(ext);
}

function generateFileKey(userId: string, ext: string): string {
  const id = crypto.randomUUID();
  return `${userId}/${id}${ext ? '.' + ext : ''}`;
}

function getR2Creds(env: EnvBindings) {
  return {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

async function enforceDownloadRateLimit(env: EnvBindings, params: { userId: string; itemId: string; ip: string }): Promise<boolean> {
  const windowSeconds = 60;
  const checks: Array<{ key: string; limit: number }> = [
    { key: `ip:${params.ip}`, limit: env.RATE_LIMIT_DOWNLOAD_PER_MINUTE },
    { key: `user:${params.userId}`, limit: env.RATE_LIMIT_DOWNLOAD_PER_USER_PER_MINUTE },
    { key: `global`, limit: env.RATE_LIMIT_GLOBAL_DOWNLOAD_PER_MINUTE },
  ];
  for (const c of checks) {
    const composite = `${c.key}:item:${params.itemId}`;
    const id = env.RATE_LIMITER_DO.idFromName(composite);
    const stub = env.RATE_LIMITER_DO.get(id);
    const res = await stub.fetch('https://do/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: composite, limit: c.limit, windowSeconds }),
    });
    if (!res.ok) return false;
    const data = await res.json<any>();
    if (!data.allowed) return false;
  }
  return true;
}


