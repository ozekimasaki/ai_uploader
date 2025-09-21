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
    // TODO: Supabase Auth/JWT 検証、ファイルサイズ検証、R2署名URL作成
    return json({ uploadId: crypto.randomUUID(), parts: [], url: null, message: 'presign stub' });
  }

  // POST /api/items/:id/download-url (stub)
  {
    const m = match(/^\/api\/items\/([A-Za-z0-9_-]+)\/download-url$/);
    if (request.method === 'POST' && m) {
      const id = m[1];
      // TODO: レート制御 + R2 署名URL
      return json({ id, url: null, ttlMinutes: env.DEFAULT_DOWNLOAD_TTL_MINUTES, message: 'download-url stub' });
    }
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


