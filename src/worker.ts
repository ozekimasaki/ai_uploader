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

async function handleApi(request: Request, env: EnvBindings, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  // Simple path params matcher
  const match = (pattern: RegExp) => pattern.exec(pathname);

  // GET /api/items
  if (request.method === 'GET' && pathname === '/api/items') {
    const page = Number(url.searchParams.get('page') ?? '1');
    const pageSize = 20;
    return json({ page, pageSize, items: [] });
  }

  // GET /api/items/:id
  {
    const m = match(/^\/api\/items\/([A-Za-z0-9_-]+)$/);
    if (request.method === 'GET' && m) {
      const id = m[1];
      return json({ id, item: null });
    }
  }

  // POST /api/items
  if (request.method === 'POST' && pathname === '/api/items') {
    const body = await safeJson(request);
    return json({ id: crypto.randomUUID(), ...body }, { status: 201 });
  }

  // POST /api/items/:id/publish
  {
    const m = match(/^\/api\/items\/([A-Za-z0-9_-]+)\/publish$/);
    if (request.method === 'POST' && m) {
      const id = m[1];
      return json({ id, published: true });
    }
  }

  // DELETE /api/items/:id
  {
    const m = match(/^\/api\/items\/([A-Za-z0-9_-]+)$/);
    if (request.method === 'DELETE' && m) {
      return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*' } });
    }
  }

  // POST /api/upload/presign (stub)
  if (request.method === 'POST' && pathname === '/api/upload/presign') {
    return json({ message: 'presign not implemented yet' }, { status: 501 });
  }

  // POST /api/items/:id/download-url (stub)
  {
    const m = match(/^\/api\/items\/([A-Za-z0-9_-]+)\/download-url$/);
    if (request.method === 'POST' && m) {
      const id = m[1];
      return json({ id, url: null, message: 'download-url not implemented yet' }, { status: 501 });
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


