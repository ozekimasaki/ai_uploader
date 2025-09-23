export interface Env {
  ENVIRONMENT: string;
  DEFAULT_DOWNLOAD_TTL_MINUTES: number;
  MAX_DOWNLOAD_TTL_MINUTES: number;
  RATE_LIMIT_DOWNLOAD_PER_MINUTE: number;
  RATE_LIMIT_UPLOAD_PER_HOUR: number;
  RATE_LIMIT_DOWNLOAD_PER_USER_PER_MINUTE: number;
  RATE_LIMIT_GLOBAL_DOWNLOAD_PER_MINUTE: number;
  MAX_FILE_SIZE_MB: number;
  ALLOWED_FILE_TYPES: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  DISCORD_WEBHOOK_URL?: string;
  R2_BUCKET: string;
  R2: R2Bucket;
  DB: D1Database;
  ASSETS: Fetcher;
  RATE_LIMITER_DO: DurableObjectNamespace;
}

const html = (s: string, status = 200) => new Response(s, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
function renderHeaderHtml(isLoggedIn: boolean, username?: string): string {
  if (isLoggedIn) {
    const my = username ? `\n            <a href="/u/${escapeHtml(username)}" class="text-blue-600">マイページ</a>` : '';
    return `<a href="/items" class="text-blue-600">一覧</a>
            <a href="/upload" class="text-blue-600">アップロード</a>${my}
            <a href="/logout" class="text-gray-600">ログアウト</a>`;
  }
  return `<button id="btnHeaderLogin" class="text-blue-600">ログイン</button>`;
}
function renderFooterHtml(): string {
  return `<div class="max-w-[980px] mx-auto px-4 py-3 text-xs text-gray-500">© <span id="y"></span> AI Uploader</div>`;
}
function renderLoginRequiredHtml(): string {
  return `<h1 class="text-lg font-semibold">ログインが必要です</h1>
  <p class="text-gray-500 text-sm mt-1">右上の「ログイン」から認証してください。</p>`;
}
function layout(title: string, body: string, opts?: { isLoggedIn?: boolean; username?: string; auth?: { supaUrl: string; anonKey: string } }): string {
  const isLoggedIn = !!opts?.isLoggedIn;
  const username = opts?.username || '';
  return `<!doctype html><html lang="ja"><head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <link rel="stylesheet" href="/app.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/plyr@3/dist/plyr.css" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
  </head><body>
    <header class="border-b border-gray-200 h-14 flex items-center">
      <div class="max-w-[980px] mx-auto px-4 w-full flex justify-between">
        <a href="/" class="font-semibold text-gray-900">AI Uploader</a>
        <nav class="flex gap-3" data-shared-header>${renderHeaderHtml(isLoggedIn, username)}</nav>
      </div>
    </header>
    <main class="max-w-[980px] mx-auto px-4 py-4">${body}</main>
    <footer class="border-t border-gray-200">${renderFooterHtml()}</footer>
  <script src="https://cdn.jsdelivr.net/npm/plyr@3/dist/plyr.polyfilled.min.js"></script>
  <script>try{window.Plyr&&new window.Plyr('video');window.Plyr&&new window.Plyr('audio');}catch(e){}</script>
  <script type="module" src="/header-login.js"></script>
  <script type="module" src="/ui-shared.js"></script>
  </body></html>`;
}

// --- Auth helpers (Supabase) ---
function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

function getAccessTokenFromRequest(req: Request): string | null {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization');
  if (auth && /^Bearer\s+(.+)/i.test(auth)) {
    const m = auth.match(/^Bearer\s+(.+)/i);
    if (m) return m[1];
  }
  const ck = parseCookies(req.headers.get('cookie'));
  if (ck['sb-access-token']) return ck['sb-access-token'];
  return null;
}

async function fetchSupabaseUser(token: string, env: Env): Promise<any | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  try {
    const res = await fetch(env.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/user', {
      headers: {
        'authorization': 'Bearer ' + token,
        'apikey': env.SUPABASE_ANON_KEY,
      }
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j || null;
  } catch {
    return null;
  }
}

async function getAuthUser(req: Request, env: Env): Promise<any | null> {
  const token = getAccessTokenFromRequest(req);
  if (!token) return null;
  return await fetchSupabaseUser(token, env);
}

// login page removed. Header handles OAuth start.

function authCallbackPage(env: Env, url: URL): Response {
  const supaUrl = escapeHtml(env.SUPABASE_URL || '');
  const anon = escapeHtml(env.SUPABASE_ANON_KEY || '');
  const redirect = escapeHtml(url.searchParams.get('redirect') || '/items');
  const body = `
  <h1 class="text-lg font-semibold">ログイン処理中...</h1>
  <p class="text-gray-500 text-sm">お待ちください。</p>
  <script type="module">
    import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
    const supabase = createClient('${supaUrl}', '${anon}');
    try {
      // Exchange OAuth code for a session (handles PKCE flow). Try modern and legacy methods.
      try { await supabase.auth.exchangeCodeForSession(window.location.href); } catch {}
      try { if (typeof supabase.auth.getSessionFromUrl === 'function') { await supabase.auth.getSessionFromUrl(); } } catch {}
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (token) {
        await fetch('/auth/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ access_token: token }) });
        location.replace('${redirect}');
      } else {
        location.replace('/?login=1');
      }
    } catch {
      location.replace('/?login=1');
    }
  </script>`;
  return html(layout('ログイン', body, { isLoggedIn: false, auth: { supaUrl: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY } }));
}

function loginRequiredPage(env: Env, url: URL): Response {
  const body = renderLoginRequiredHtml();
  return html(layout('ログインが必要です', body, { isLoggedIn: false, auth: { supaUrl: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY } }));
}

function normalizeUsernameFromId(uid: string): string {
  const base = String(uid||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const s = base || 'user';
  return s.slice(0, 10).padEnd(3, '0');
}

async function enforceRateLimitByDo(name: string, windowSec: number, limit: number, env: Env): Promise<{ allowed: boolean; resetAt: number }>{
  try {
    const id = env.RATE_LIMITER_DO.idFromName(name);
    const stub = env.RATE_LIMITER_DO.get(id);
    const resp = await stub.fetch(`https://do/limit?window=${windowSec}&limit=${limit}`, { method: 'POST' });
    const j: any = await resp.json().catch(()=>({ allowed: true }));
    const allowed = j?.allowed !== false;
    const resetAt = Number(j?.resetAt || 0);
    return { allowed, resetAt };
  } catch {
    return { allowed: true, resetAt: 0 };
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // Canonicalize top: /index.html -> /
    if (url.pathname === '/index.html') {
      return Response.redirect(new URL('/', url.origin), 301);
    }

    // Auth routes
    if (url.pathname === '/auth/config' && req.method === 'GET') {
      const data = { url: env.SUPABASE_URL || '', anonKey: env.SUPABASE_ANON_KEY || '' };
      return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }
    if (url.pathname === '/auth/me' && req.method === 'GET') {
    const user = await getAuthUser(req, env);
    if (!user) {
      return new Response(JSON.stringify({ loggedIn: false }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }
    try {
      await ensureTables(env);
    } catch {}
    const uid = String((user as any)?.id || '');
    let username = '';
    try {
      const row: any = await env.DB.prepare(`SELECT username FROM users WHERE id = ? LIMIT 1`).bind(uid).first();
      username = String(row?.username ?? row?.USERNAME ?? '');
      if (!/^[a-z0-9]{3,32}$/.test(username)) {
        username = normalizeUsernameFromId(uid);
        try { await env.DB.prepare(`UPDATE users SET username = ? WHERE id = ?`).bind(username, uid).run(); } catch {}
      }
    } catch {
      username = normalizeUsernameFromId(uid);
      try { await env.DB.prepare(`INSERT OR IGNORE INTO users (id, username, displayName) VALUES (?, ?, ?)`).bind(uid, username, '').run(); } catch {}
    }
    return new Response(JSON.stringify({ loggedIn: true, userId: uid, username }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }
    if (url.pathname === '/auth/callback' && req.method === 'GET') {
      return authCallbackPage(env, url);
    }
    if (url.pathname === '/auth/session' && req.method === 'POST') {
      try {
        const body: any = await req.json().catch(()=>({} as any));
        const token = String(body?.access_token || '').trim();
        if (!token) return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers: { 'content-type': 'application/json' } });
        const user = await fetchSupabaseUser(token, env);
        if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
        // Issue cookie
        const isHttps = url.protocol === 'https:';
        const cookieParts = [
          'sb-access-token=' + token,
          'Path=/',
          'HttpOnly',
          'SameSite=Lax',
        ];
        if (isHttps) cookieParts.push('Secure');
        // set short max-age, rely on re-login as needed
        cookieParts.push('Max-Age=3600');
        const headers = new Headers();
        headers.set('content-type', 'application/json');
        headers.append('Set-Cookie', cookieParts.join('; '));
        // Ensure user exists in DB (best-effort)
        try {
          await ensureTables(env);
          const uid = String(user?.id || '');
          const display = String(user?.user_metadata?.name || user?.email || '');
          const uname = normalizeUsernameFromId(uid);
          if (uid) {
            // upsert by id; keep username normalized
            await env.DB.prepare(`INSERT INTO users (id, username, displayName) VALUES (?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET username=excluded.username, displayName=excluded.displayName`)
              .bind(uid, uname, display || uname).run();
          }
        } catch {}
        return new Response(JSON.stringify({ ok: true }), { headers });
      } catch {
        return new Response(JSON.stringify({ error: 'internal' }), { status: 500, headers: { 'content-type': 'application/json' } });
      }
    }
    if (url.pathname === '/logout' && (req.method === 'GET' || req.method === 'POST')) {
      const isHttps = url.protocol === 'https:';
      const headers = new Headers();
      const parts = [ 'sb-access-token=; Path=/','HttpOnly','SameSite=Lax','Max-Age=0' ];
      if (isHttps) parts.push('Secure');
      headers.append('Set-Cookie', parts.join('; '));
      const dest = url.searchParams.get('redirect') || '/';
      headers.set('Location', dest);
      return new Response(null, { status: 302, headers });
    }

    // Protect pages and upload endpoints
    const isProtectedPage = req.method === 'GET' && (
      url.pathname === '/' ||
      url.pathname === '/items' ||
      /^\/items\/[A-Za-z0-9_-]+$/.test(url.pathname) ||
      /^\/u\/[A-Za-z0-9_-]+$/.test(url.pathname) ||
      url.pathname === '/upload'
    );
    if (isProtectedPage) {
      const user = await getAuthUser(req, env);
      if (!user) return loginRequiredPage(env, url);
    }

    const isProtectedUploadApi = (
      (url.pathname.startsWith('/api/upload/multipart/') && (req.method === 'POST' || req.method === 'PUT')) ||
      (url.pathname === '/api/upload' && req.method === 'POST')
    );
    if (isProtectedUploadApi) {
      const user = await getAuthUser(req, env);
      if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
    }

    // multipart upload endpoints for large files
    if (url.pathname === '/api/upload/multipart/init' && req.method === 'POST') {
      try {
        // rate limit: per user per hour
        const authed = await getAuthUser(req, env).catch(()=>null);
        const uid = String((authed as any)?.id || '');
        if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
        const perHour = Math.max(1, Number(env.RATE_LIMIT_UPLOAD_PER_HOUR || 50));
        const r = await enforceRateLimitByDo(`upl:${uid}`, 3600, perHour, env);
        if (!r.allowed) {
          const h = new Headers({ 'content-type':'application/json' });
          if (r.resetAt) h.set('retry-after', String(Math.max(1, Math.ceil((r.resetAt - Date.now())/1000))));
          return new Response(JSON.stringify({ error: 'rate_limited', scope: 'upload_per_user_per_hour', resetAt: r.resetAt }), { status: 429, headers: h });
        }
        const body: any = await req.json().catch(() => ({} as any));
        const filename = String(body?.filename || '').trim();
        const contentType = String(body?.contentType || 'application/octet-stream');
        if (!filename) return new Response(JSON.stringify({ error: 'bad_request', message: 'filename required' }), { status: 400, headers: { 'content-type': 'application/json' } });
        // type validation
        const ext = extractExt(filename);
        const extNoDot = ext ? ext.slice(1).toLowerCase() : '';
        if (!isAllowedByConfig(extNoDot || inferExtFromContentType(contentType), contentType, env)) {
          return new Response(JSON.stringify({ error: 'unsupported_type' }), { status: 400, headers: { 'content-type': 'application/json' } });
        }
        const id = crypto.randomUUID();
        const key = `items/${id}/source${ext || ''}`;
        const mpu: any = await (env.R2 as any).createMultipartUpload(key, { httpMetadata: { contentType } });
        const uploadId = mpu?.uploadId || mpu?.uploadID || '';
        const partSizeBytes = 10 * 1024 * 1024; // 10MiB
        return new Response(JSON.stringify({ id, key, uploadId, partSizeBytes }), { headers: { 'content-type': 'application/json' } });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: 'init_failed', message: String(e?.message || e) }), { status: 500, headers: { 'content-type': 'application/json' } });
      }
    }
    if (url.pathname === '/api/upload/multipart/part' && req.method === 'PUT') {
      try {
        const key = url.searchParams.get('key') || '';
        const uploadId = url.searchParams.get('uploadId') || '';
        const partNumber = Number(url.searchParams.get('partNumber') || '0');
        if (!key || !uploadId || !partNumber) return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers: { 'content-type': 'application/json' } });
        const mpu: any = await (env.R2 as any).resumeMultipartUpload(key, uploadId);
        const res: any = await mpu.uploadPart(partNumber, (req as any).body);
        const etag = res?.etag || res?.ETag || '';
        return new Response(JSON.stringify({ etag }), { headers: { 'content-type': 'application/json' } });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: 'part_failed', message: String(e?.message || e) }), { status: 500, headers: { 'content-type': 'application/json' } });
      }
    }
    if (url.pathname === '/api/upload/multipart/complete' && req.method === 'POST') {
      try {
        const body: any = await req.json().catch(() => ({} as any));
        const key = String(body?.key || '');
        const uploadId = String(body?.uploadId || '');
        const partsIn: any[] = Array.isArray(body?.parts) ? body.parts : [];
        if (!key || !uploadId || !partsIn.length) return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers: { 'content-type': 'application/json' } });
        const parts = partsIn.map((p: any) => ({ partNumber: Number(p.partNumber), etag: String(p.etag) }));
        const mpu: any = await (env.R2 as any).resumeMultipartUpload(key, uploadId);
        await mpu.complete(parts);
        return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: 'complete_failed', message: String(e?.message || e) }), { status: 500, headers: { 'content-type': 'application/json' } });
      }
    }
    if (url.pathname === '/api/upload/multipart/abort' && req.method === 'POST') {
      try {
        const body: any = await req.json().catch(() => ({} as any));
        const key = String(body?.key || '');
        const uploadId = String(body?.uploadId || '');
        if (!key || !uploadId) return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers: { 'content-type': 'application/json' } });
        const mpu: any = await (env.R2 as any).resumeMultipartUpload(key, uploadId);
        await mpu.abort();
        return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: 'abort_failed', message: String(e?.message || e) }), { status: 500, headers: { 'content-type': 'application/json' } });
      }
    }
    if (url.pathname === '/api/upload' && req.method === 'POST') {
      // 診断情報（失敗時に詳細を表示）
      const diag: any = { id: '', mainKey: '', thumbKey: '', insertCols: [] as string[], insertValsPreview: [] as string[], tags: [] as string[] };
      try {
        // rate limit: per user per hour
        const authed = await getAuthUser(req, env).catch(()=>null);
        const uidForLimit = String((authed as any)?.id || '');
        if (!uidForLimit) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
        const perHour = Math.max(1, Number(env.RATE_LIMIT_UPLOAD_PER_HOUR || 50));
        const r = await enforceRateLimitByDo(`upl:${uidForLimit}`, 3600, perHour, env);
        if (!r.allowed) {
          const h = new Headers({ 'content-type':'application/json' });
          if (r.resetAt) h.set('retry-after', String(Math.max(1, Math.ceil((r.resetAt - Date.now())/1000))));
          return new Response(JSON.stringify({ error: 'rate_limited', scope: 'upload_per_user_per_hour', resetAt: r.resetAt }), { status: 429, headers: h });
        }
        await ensureTables(env);
        if (!authed) {
          if ((req.headers.get('accept') || '').includes('application/json')) {
            return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
          }
          return loginRequiredPage(env, url);
        }
        const form = await req.formData();
        const preuploadedKey = String(form.get('preuploadedKey') || '').trim();
        const file = form.get('file');
        if (!preuploadedKey && (!(file instanceof File) || (file as File).size === 0)) return html(layout('エラー', `<h1 class=\"text-lg font-semibold\">エラー</h1><p class=\"text-sm text-red-600\">ファイルは必須です。</p>`, { isLoggedIn: true }), 400);

        const title = String(form.get('title') || '').trim();
        const category = String(form.get('category') || '').trim().toUpperCase();
        const visibility = (String(form.get('visibility') || 'private').trim().toLowerCase() === 'public') ? 'public' : 'private';
        const description = String(form.get('description') || '').trim();
        const prompt = String(form.get('prompt') || '').trim();
        const tagsInput = String(form.get('tags') || '').trim();
        const thumbnail = form.get('thumbnail');

        if (!title) return html(layout('エラー', `<h1 class="text-lg font-semibold">エラー</h1><p class="text-sm text-red-600">タイトルは必須です。</p>`), 400);
        const allowedCats = ['IMAGE','VIDEO','MUSIC','VOICE','3D','OTHER'];
        if (!allowedCats.includes(category)) return html(layout('エラー', `<h1 class=\"text-lg font-semibold\">エラー</h1><p class=\"text-sm text-red-600\">カテゴリーが不正です。</p>`, { isLoggedIn: true }), 400);

        const maxMb = Number(env.MAX_FILE_SIZE_MB || 2048);
        if (Number.isFinite(maxMb)) {
          const mb = preuploadedKey ? Number(form.get('sizeBytes') || 0) / (1024*1024) : (file as File).size / (1024*1024);
          if (mb > maxMb) return html(layout('エラー', `<h1 class=\"text-lg font-semibold\">エラー</h1><p class=\"text-sm text-red-600\">ファイルサイズが上限(${maxMb}MB)を超えています。</p>`, { isLoggedIn: true }), 400);
        }

        const id = crypto.randomUUID();
        diag.id = id;
        const nowIso = new Date().toISOString();
        let mainKey = preuploadedKey;
        let contentType: string;
        let srcExt: string;
        if (preuploadedKey) {
          contentType = String(form.get('contentType') || 'application/octet-stream');
          srcExt = extractExt(preuploadedKey);
        } else {
          const f = file as File;
          srcExt = extractExt((f as any).name || '');
          contentType = (f as any).type || 'application/octet-stream';
          mainKey = `items/${id}/source${srcExt}`;
          // ALLOWED_FILE_TYPES 検証
          const extNoDot = (srcExt || '').slice(1).toLowerCase() || inferExtFromContentType(contentType);
          if (!isAllowedByConfig(extNoDot, contentType, env)) {
            return html(layout('エラー', `<h1 class=\"text-lg font-semibold\">エラー</h1><p class=\"text-sm text-red-600\">許可されていないファイル種別です。</p>`), 400);
          }
          await env.R2.put(mainKey, f.stream(), { httpMetadata: { contentType } });
        }
        // preuploadedKey 経由のときも型チェック
        {
          const extNoDot = (srcExt || '').slice(1).toLowerCase() || inferExtFromContentType(contentType);
          if (!isAllowedByConfig(extNoDot, contentType, env)) {
            return html(layout('エラー', `<h1 class=\"text-lg font-semibold\">エラー</h1><p class=\"text-sm text-red-600\">許可されていないファイル種別です。</p>`), 400);
          }
        }
        const thumbKey = (thumbnail instanceof File && (thumbnail as File).size > 0) ? `items/${id}/thumb${extractExt((thumbnail as any).name || '')}` : '';
        diag.mainKey = mainKey; diag.thumbKey = thumbKey;
        if (thumbKey) {
          await env.R2.put(thumbKey, (thumbnail as File).stream(), { httpMetadata: { contentType: (thumbnail as File).type || 'image/png' } });
        }

        // Ensure anonymous user exists to satisfy FK
        try {
          await env.DB.prepare(`INSERT OR IGNORE INTO users (id, username, displayName) VALUES (?, ?, ?)`)
            .bind('anonymous', 'anonymous', 'Anonymous').run();
        } catch {}

        // 所有者ID（Supabaseユーザー）
        const ownerUserId = String((authed as any)?.id || '');
        try {
          if (ownerUserId) {
            const display = String((authed as any)?.user_metadata?.name || (authed as any)?.email || ownerUserId);
            const uname = ownerUserId.slice(0, 10);
            await env.DB.prepare(`INSERT OR IGNORE INTO users (id, username, displayName) VALUES (?, ?, ?)`)
              .bind(ownerUserId, uname, display).run();
          }
        } catch {}

        // items 挿入（スキーマ差異に合わせて動的にカラム選択）
        const colsInfo: any = await env.DB.prepare(`PRAGMA table_info(items)`).all();
        const rowsInfo: any[] = colsInfo?.results ?? colsInfo ?? [];
        const nameMap = new Map<string,string>(); // lower -> actual
        for (const r of rowsInfo) {
          const n = String(r.name ?? r.NAME ?? '').trim();
          if (n) nameMap.set(n.toLowerCase(), n);
        }
        const present = (names: string[]) => names.map(n=>n).filter(n=>nameMap.has(n.toLowerCase())).map(n=>nameMap.get(n.toLowerCase()) as string);

        const insertCols: string[] = [];
        const insertVals: any[] = [];
        const addedCols = new Set<string>();
        const add = (c: string, v: any) => {
          if (addedCols.has(c)) return;
          addedCols.add(c);
          insertCols.push(c);
          insertVals.push(v);
        };
        const addAny = (cands: string[], v: any) => { const list = present(cands); for (const c of list) add(c, v); };

        addAny(['id'], id);
        addAny(['ownerUserId','owner_user_id','OWNER_USER_ID'], ownerUserId);
        addAny(['title','TITLE'], title);
        addAny(['category','CATEGORY'], category);
        addAny(['visibility','VISIBILITY'], visibility);
        addAny(['description','DESCRIPTION'], description);
        addAny(['prompt','PROMPT'], prompt);
        const originalName = preuploadedKey ? String(form.get('filename') || '') : (file as any).name || '';
        const sizeBytes = preuploadedKey ? Number(form.get('sizeBytes') || 0) : Number((file as any).size || 0);
        addAny(['original_filename','originalFilename','ORIGINAL_FILENAME'], originalName);
        addAny(['size_bytes','sizeBytes','SIZE_BYTES'], sizeBytes);
        addAny(['file_key','fileKey','FILE_KEY'], mainKey);
        addAny(['contentType','CONTENT_TYPE'], contentType);
        addAny(['extension','EXTENSION'], srcExt ? srcExt.slice(1) : '');
        addAny(['thumbnail_key','thumbnailKey','THUMBNAIL_KEY'], thumbKey || null);
        addAny(['created_at','createdAt','CREATED_AT'], nowIso);
        addAny(['updated_at','updatedAt','UPDATED_AT'], nowIso);

        const placeholders = insertCols.map(()=>'?').join(',');
        const sqlIns = `INSERT INTO items (${insertCols.join(',')}) VALUES (${placeholders})`;
        // 診断プレビュー
        diag.insertCols = insertCols.slice(0);
        diag.insertValsPreview = insertVals.map((v) => typeof v === 'string' ? (v.length > 120 ? v.slice(0,117)+'...' : v) : String(v));
        await env.DB.prepare(sqlIns).bind(...insertVals).run();

        // tags
        const tags = parseTags(tagsInput);
        diag.tags = tags.slice(0);
        // tags列名（created_at / createdAt）を吸収
        let tagCreatedCol: string | undefined;
        try {
          const tinfo: any = await env.DB.prepare(`PRAGMA table_info(tags)`).all();
          const trows: any[] = tinfo?.results ?? tinfo ?? [];
          const tnames = new Set<string>(trows.map((r: any) => String(r.name ?? r.NAME ?? '').toLowerCase()));
          if (tnames.has('created_at')) tagCreatedCol = 'created_at';
          else if (tnames.has('createdat')) tagCreatedCol = 'createdAt';
        } catch {}
        if (tags.length) {
          for (const label of tags) {
            const slug = slugify(label);
            if (tagCreatedCol) {
              await env.DB.prepare(`INSERT OR IGNORE INTO tags (id, label, ${tagCreatedCol}) VALUES (?, ?, ?)`).bind(slug, label, nowIso).run();
            } else {
              await env.DB.prepare(`INSERT OR IGNORE INTO tags (id, label) VALUES (?, ?)`).bind(slug, label).run();
            }
            await env.DB.prepare(`INSERT OR IGNORE INTO item_tags (itemId, tagId) VALUES (?, ?)`)
              .bind(id, slug).run();
          }
        }

        if ((req.headers.get('accept') || '').includes('application/json')) {
          return new Response(JSON.stringify({ ok: true, id, path: `/items/${id}` }), { headers: { 'content-type': 'application/json' } });
        }
        return Response.redirect(new URL(`/items/${id}`, url.origin), 303);
      } catch (e: any) {
        const details = await buildDetailedErrorHtml(e, env, diag);
        return html(layout('エラー', details, { isLoggedIn: true }), 500);
      }
    }

    // JSON items API (list, detail, create)
    // List items (login required; public items only)
    if (url.pathname === '/api/items' && req.method === 'GET') {
      const authed = await getAuthUser(req, env);
      if (!authed) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
      try {
        await ensureTables(env);
      } catch {}
      try {
        const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
        const pageSize = 20;
        const q = String(url.searchParams.get('q') || '').trim();
        const categoryParam = String(url.searchParams.get('category') || '').trim().toUpperCase();
        const tagParam = String(url.searchParams.get('tag') || '').trim();
        const sort = String(url.searchParams.get('sort') || 'new').trim();
        const whereParts: string[] = ["visibility = 'public'"];
        const binds: any[] = [];
        if (categoryParam) { whereParts.push('(category = ? OR CATEGORY = ? OR UPPER(category) = ?)'); binds.push(categoryParam, categoryParam, categoryParam); }
        if (q) { whereParts.push('(title LIKE ? OR description LIKE ?)'); const like = `%${q}%`; binds.push(like, like); }
        if (tagParam) { whereParts.push(`id IN (SELECT it.itemId FROM item_tags it JOIN tags t ON t.id = it.tagId WHERE t.id = ? OR t.label = ?)`); binds.push(tagParam, tagParam); }
        let orderBy = "COALESCE(createdAt, created_at, '') DESC, rowid DESC";
        if (sort === 'popular') orderBy = "COALESCE(downloadCount, 0) DESC, COALESCE(createdAt, created_at, '') DESC, rowid DESC";
        const limit = pageSize + 1;
        const offset = (page - 1) * pageSize;
        const sql = `SELECT * FROM items WHERE ${whereParts.join(' AND ')} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
        const res: any = await env.DB.prepare(sql).bind(...binds, limit, offset).all();
        const rows: any[] = res?.results ?? res ?? [];
        const hasNext = rows.length > pageSize;
        let items = rows.slice(0, pageSize).map((r: any) => ({
          id: r.id ?? r.ID,
          ownerUserId: r.ownerUserId ?? r.OWNERUSERID ?? r.owner_user_id ?? r.OWNER_USER_ID ?? '',
          title: r.title ?? r.TITLE ?? 'Untitled',
          category: r.category ?? r.CATEGORY ?? 'OTHER',
          visibility: r.visibility ?? r.VISIBILITY ?? 'public',
          originalFilename: r.original_filename ?? r.originalFilename ?? r.ORIGINAL_FILENAME ?? '',
          sizeBytes: Number(r.size_bytes ?? r.sizeBytes ?? r.SIZE_BYTES ?? 0),
          fileKey: r.file_key ?? r.fileKey ?? r.FILE_KEY ?? '',
          thumbnailKey: r.thumbnail_key ?? r.thumbnailKey ?? r.THUMBNAIL_KEY ?? '',
          createdAt: r.created_at ?? r.createdAt ?? r.CREATED_AT ?? null,
          downloadCount: Number(r.downloadCount ?? r.DOWNLOADCOUNT ?? r.download_count ?? 0),
          tags: [] as string[],
        }));
        // enrich tags if any
        try {
          const ids = items.map((it: any) => it.id).filter(Boolean);
          if (ids.length) {
            const placeholders = ids.map(() => '?').join(',');
            const sql2 = `SELECT it.itemId as id, GROUP_CONCAT(t.label, ',') as labels\n                   FROM item_tags it\n                   JOIN tags t ON t.id = it.tagId\n                   WHERE it.itemId IN (${placeholders})\n                   GROUP BY it.itemId`;
            const res2: any = await env.DB.prepare(sql2).bind(...ids).all();
            const rows2: any[] = res2?.results ?? res2 ?? [];
            const idToTags: Record<string, string[]> = {};
            for (const r2 of rows2) {
              const rid = r2.id ?? r2.ID ?? r2.itemId ?? r2.ITEMID;
              const s = r2.labels ?? r2.LABELS ?? '';
              idToTags[String(rid)] = s ? String(s).split(',').map((x: string) => x.trim()).filter(Boolean) : [];
            }
            items = items.map((it: any) => ({ ...it, tags: idToTags[String(it.id)] ?? [] }));
          }
        } catch {}
        return new Response(JSON.stringify({ page, hasNext, items }), { headers: { 'content-type': 'application/json' } });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: 'internal', message: String(e?.message || e) }), { status: 500, headers: { 'content-type': 'application/json' } });
      }
    }

    // Get item detail (login required)
    {
      const m = /^\/api\/items\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
      if (m && req.method === 'GET') {
        const authed = await getAuthUser(req, env);
        if (!authed) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
        try { await ensureTables(env); } catch {}
        const id = m[1];
        try {
          const row: any = await env.DB.prepare(`SELECT * FROM items WHERE id = ? LIMIT 1`).bind(id).first();
          if (!row) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'content-type': 'application/json' } });
          const visibilityRaw = String(row.visibility ?? row.VISIBILITY ?? 'public').toLowerCase();
          const ownerId = row.ownerUserId ?? row.OWNERUSERID ?? row.owner_user_id ?? row.OWNER_USER_ID ?? '';
          const viewerId = String((authed as any)?.id || '');
          if (visibilityRaw === 'private' && (!viewerId || viewerId !== ownerId)) {
            return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'content-type': 'application/json' } });
          }
          const it: any = {
            id: row.id ?? row.ID,
            ownerUserId: ownerId,
            title: row.title ?? row.TITLE ?? 'Untitled',
            description: row.description ?? row.DESCRIPTION ?? '',
            prompt: row.prompt ?? row.PROMPT ?? '',
            category: row.category ?? row.CATEGORY ?? 'OTHER',
            visibility: row.visibility ?? row.VISIBILITY ?? 'public',
            originalFilename: row.original_filename ?? row.originalFilename ?? row.ORIGINAL_FILENAME ?? '',
            sizeBytes: Number(row.size_bytes ?? row.sizeBytes ?? row.SIZE_BYTES ?? 0),
            fileKey: row.file_key ?? row.fileKey ?? row.FILE_KEY ?? '',
            thumbnailKey: row.thumbnail_key ?? row.thumbnailKey ?? row.THUMBNAIL_KEY ?? '',
            contentType: row.contentType ?? row.CONTENTTYPE ?? row.CONTENT_TYPE ?? '',
            extension: row.extension ?? row.EXTENSION ?? '',
            downloadCount: Number(row.downloadCount ?? row.DOWNLOADCOUNT ?? row.download_count ?? 0),
            createdAt: row.created_at ?? row.CREATED_AT ?? row.createdAt ?? null,
            tags: [] as string[],
          };
          try {
            const resT: any = await env.DB.prepare(
              `SELECT GROUP_CONCAT(t.label, ',') as labels FROM item_tags it JOIN tags t ON t.id = it.tagId WHERE it.itemId = ?`
            ).bind(it.id).first();
            const labels = resT?.labels ?? resT?.LABELS ?? '';
            it.tags = labels ? String(labels).split(',').map((s: string)=>s.trim()).filter(Boolean) : [];
          } catch {}
          return new Response(JSON.stringify({ item: it }), { headers: { 'content-type': 'application/json' } });
        } catch (e: any) {
          return new Response(JSON.stringify({ error: 'internal', message: String(e?.message || e) }), { status: 500, headers: { 'content-type': 'application/json' } });
        }
      }
    }

    // Create item metadata via JSON (login required)
    if (url.pathname === '/api/items' && req.method === 'POST') {
      const authed = await getAuthUser(req, env);
      if (!authed) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
      try { await ensureTables(env); } catch {}
      try {
        const body: any = await req.json().catch(()=>({}));
        const title = String(body?.title || '').trim();
        const category = String(body?.category || '').trim().toUpperCase();
        const visibility = (String(body?.visibility || 'private').trim().toLowerCase() === 'public') ? 'public' : 'private';
        const description = String(body?.description || '').trim();
        const prompt = String(body?.prompt || '').trim();
        const tagsInputRaw = Array.isArray(body?.tags) ? String((body?.tags||[]).join(',')) : String(body?.tags || '');
        const fileKeyIn = String(body?.fileKey || body?.preuploadedKey || '').trim();
        const originalName = String(body?.originalFilename || body?.filename || '').trim();
        const contentTypeIn = String(body?.contentType || '').trim() || 'application/octet-stream';
        const sizeBytes = Number(body?.sizeBytes || 0);
        if (!title) return new Response(JSON.stringify({ error: 'bad_request', message: 'title required' }), { status: 400, headers: { 'content-type': 'application/json' } });
        const allowedCats = ['IMAGE','VIDEO','MUSIC','VOICE','3D','OTHER'];
        if (!allowedCats.includes(category)) return new Response(JSON.stringify({ error: 'bad_request', message: 'invalid category' }), { status: 400, headers: { 'content-type': 'application/json' } });
        if (!fileKeyIn) return new Response(JSON.stringify({ error: 'bad_request', message: 'fileKey required' }), { status: 400, headers: { 'content-type': 'application/json' } });
        // validate type against config
        const srcExt = extractExt(fileKeyIn) || extractExt(originalName) || (inferExtFromContentType(contentTypeIn) ? ('.' + inferExtFromContentType(contentTypeIn)) : '');
        const extNoDot = (srcExt || '').slice(1).toLowerCase() || inferExtFromContentType(contentTypeIn);
        if (!isAllowedByConfig(extNoDot, contentTypeIn, env)) {
          return new Response(JSON.stringify({ error: 'unsupported_type' }), { status: 400, headers: { 'content-type': 'application/json' } });
        }
        const id = crypto.randomUUID();
        const nowIso = new Date().toISOString();
        const ownerUserId = String((authed as any)?.id || '');
        try {
          if (ownerUserId) {
            const display = String((authed as any)?.user_metadata?.name || (authed as any)?.email || ownerUserId);
            const uname = ownerUserId.slice(0, 10);
            await env.DB.prepare(`INSERT OR IGNORE INTO users (id, username, displayName) VALUES (?, ?, ?)`).bind(ownerUserId, uname, display).run();
          }
        } catch {}
        // dynamic insert like /api/upload
        const colsInfo: any = await env.DB.prepare(`PRAGMA table_info(items)`).all();
        const rowsInfo: any[] = colsInfo?.results ?? colsInfo ?? [];
        const nameMap = new Map<string,string>();
        for (const r of rowsInfo) {
          const n = String(r.name ?? r.NAME ?? '').trim();
          if (n) nameMap.set(n.toLowerCase(), n);
        }
        const present = (names: string[]) => names.map(n=>n).filter(n=>nameMap.has(n.toLowerCase())).map(n=>nameMap.get(n.toLowerCase()) as string);
        const insertCols: string[] = [];
        const insertVals: any[] = [];
        const addedCols = new Set<string>();
        const add = (c: string, v: any) => { if (addedCols.has(c)) return; addedCols.add(c); insertCols.push(c); insertVals.push(v); };
        const addAny = (cands: string[], v: any) => { const list = present(cands); for (const c of list) add(c, v); };
        addAny(['id'], id);
        addAny(['ownerUserId','owner_user_id','OWNER_USER_ID'], ownerUserId);
        addAny(['title','TITLE'], title);
        addAny(['category','CATEGORY'], category);
        addAny(['visibility','VISIBILITY'], visibility);
        addAny(['description','DESCRIPTION'], description);
        addAny(['prompt','PROMPT'], prompt);
        addAny(['original_filename','originalFilename','ORIGINAL_FILENAME'], originalName);
        addAny(['size_bytes','sizeBytes','SIZE_BYTES'], Number.isFinite(sizeBytes) ? sizeBytes : 0);
        addAny(['file_key','fileKey','FILE_KEY'], fileKeyIn);
        addAny(['contentType','CONTENT_TYPE'], contentTypeIn);
        addAny(['extension','EXTENSION'], (srcExt || '').slice(1));
        addAny(['thumbnail_key','thumbnailKey','THUMBNAIL_KEY'], String(body?.thumbnailKey || '') || null);
        addAny(['created_at','createdAt','CREATED_AT'], nowIso);
        addAny(['updated_at','updatedAt','UPDATED_AT'], nowIso);
        const placeholders = insertCols.map(()=>'?').join(',');
        const sqlIns = `INSERT INTO items (${insertCols.join(',')}) VALUES (${placeholders})`;
        await env.DB.prepare(sqlIns).bind(...insertVals).run();
        // tags
        const tags = parseTags(tagsInputRaw);
        let tagCreatedCol: string | undefined;
        try {
          const tinfo: any = await env.DB.prepare(`PRAGMA table_info(tags)`).all();
          const trows: any[] = tinfo?.results ?? tinfo ?? [];
          const tnames = new Set<string>(trows.map((r: any) => String(r.name ?? r.NAME ?? '').toLowerCase()));
          if (tnames.has('created_at')) tagCreatedCol = 'created_at'; else if (tnames.has('createdat')) tagCreatedCol = 'createdAt';
        } catch {}
        if (tags.length) {
          for (const label of tags) {
            const slug = slugify(label);
            if (tagCreatedCol) {
              await env.DB.prepare(`INSERT OR IGNORE INTO tags (id, label, ${tagCreatedCol}) VALUES (?, ?, ?)`).bind(slug, label, nowIso).run();
            } else {
              await env.DB.prepare(`INSERT OR IGNORE INTO tags (id, label) VALUES (?, ?)`).bind(slug, label).run();
            }
            await env.DB.prepare(`INSERT OR IGNORE INTO item_tags (itemId, tagId) VALUES (?, ?)`).bind(id, slug).run();
          }
        }
        return new Response(JSON.stringify({ ok: true, id, path: `/items/${id}` }), { headers: { 'content-type': 'application/json' } });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: 'internal', message: String(e?.message || e) }), { status: 500, headers: { 'content-type': 'application/json' } });
      }
    }

    // publish toggle (owner only)
    {
      const m = /^\/api\/items\/([A-Za-z0-9_-]+)\/publish$/.exec(url.pathname);
      if (m && req.method === 'POST') {
        const authed = await getAuthUser(req, env);
        if (!authed) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
        const id = m[1];
        try {
          await ensureTables(env);
          const row: any = await env.DB.prepare(`SELECT * FROM items WHERE id = ? LIMIT 1`).bind(id).first();
          if (!row) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'content-type': 'application/json' } });
          const owner = row.ownerUserId ?? row.OWNERUSERID ?? row.owner_user_id ?? row.OWNER_USER_ID ?? '';
          const uid = String((authed as any)?.id || '');
          if (!uid || owner !== uid) {
            return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } });
          }
          const body: any = await req.json().catch(()=>({}));
          const visibilityIn = String(body?.visibility || 'public').toLowerCase();
          const toPublic = visibilityIn !== 'private';
          const nowIso = new Date().toISOString();
          if (toPublic) {
            await env.DB.prepare(`UPDATE items SET visibility = 'public', published_at = ?, updated_at = ? WHERE id = ?`).bind(nowIso, nowIso, id).run();
          } else {
            await env.DB.prepare(`UPDATE items SET visibility = 'private', published_at = NULL, updated_at = ? WHERE id = ?`).bind(nowIso, id).run();
          }
          return new Response(JSON.stringify({ ok: true, id, visibility: toPublic ? 'public' : 'private', publishedAt: toPublic ? nowIso : null }), { headers: { 'content-type': 'application/json' } });
        } catch (e: any) {
          return new Response(JSON.stringify({ error: 'internal', message: String(e?.message || e) }), { status: 500, headers: { 'content-type': 'application/json' } });
        }
      }
    }

    // delete item (owner only)
    {
      const m = /^\/api\/items\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
      if (m && req.method === 'DELETE') {
        const authed = await getAuthUser(req, env);
        if (!authed) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
        const uid = String((authed as any)?.id || '');
        const id = m[1];
        try {
          await ensureTables(env);
          const row: any = await env.DB.prepare(`SELECT * FROM items WHERE id = ? LIMIT 1`).bind(id).first();
          if (!row) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'content-type': 'application/json' } });
          const owner = row.ownerUserId ?? row.OWNERUSERID ?? row.owner_user_id ?? row.OWNER_USER_ID ?? '';
          if (!uid || owner !== uid) {
            return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } });
          }
          // Delete R2 objects (by prefix, then explicit keys as fallback)
          try {
            const prefix = `items/${id}/`;
            const listing: any = await (env.R2 as any).list({ prefix });
            const objs: any[] = (listing?.objects ?? listing) || [];
            for (const o of objs) {
              const k = o?.key || o?.name || '';
              if (k) await env.R2.delete(k);
            }
          } catch {}
          try { const fk = row.file_key ?? row.fileKey ?? row.FILE_KEY ?? ''; if (fk) await env.R2.delete(fk); } catch {}
          try { const tk = row.thumbnail_key ?? row.thumbnailKey ?? row.THUMBNAIL_KEY ?? ''; if (tk) await env.R2.delete(tk); } catch {}

          // Delete DB rows
          try { await env.DB.prepare(`DELETE FROM item_tags WHERE itemId = ?`).bind(id).run(); } catch {}
          await env.DB.prepare(`DELETE FROM items WHERE id = ?`).bind(id).run();
          return new Response(JSON.stringify({ ok: true, id }), { headers: { 'content-type': 'application/json' } });
        } catch (e: any) {
          return new Response(JSON.stringify({ error: 'internal', message: String(e?.message || e) }), { status: 500, headers: { 'content-type': 'application/json' } });
        }
      }
    }

    // issue download URL (signed-like via token) - login required
    {
      const m = /^\/api\/items\/([A-Za-z0-9_-]+)\/download-url$/.exec(url.pathname);
      if (m && req.method === 'POST') {
        const authed = await getAuthUser(req, env);
        if (!authed) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
        const userId = String((authed as any)?.id || '');
        const id = m[1];
        try {
          await ensureTables(env);
          const row: any = await env.DB.prepare(`SELECT * FROM items WHERE id = ? LIMIT 1`).bind(id).first();
          if (!row) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'content-type': 'application/json' } });
          const owner = row.ownerUserId ?? row.OWNERUSERID ?? row.owner_user_id ?? row.OWNER_USER_ID ?? '';
          const visibility = String(row.visibility ?? row.VISIBILITY ?? 'public');
          const canDownload = visibility === 'public' || (owner && owner === userId);
          if (!canDownload) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } });

          const fileKey = row.file_key ?? row.fileKey ?? row.FILE_KEY ?? '';
          if (!fileKey) return new Response(JSON.stringify({ error: 'bad_item' }), { status: 400, headers: { 'content-type': 'application/json' } });

          // rate limit: per IP+user+item
          try {
            const ip = req.headers.get('cf-connecting-ip') || '0.0.0.0';
            const windowSec = 60;
            const perKeyLimit = Number(env.RATE_LIMIT_DOWNLOAD_PER_MINUTE || 10);
            const do1 = env.RATE_LIMITER_DO.get(env.RATE_LIMITER_DO.idFromName(`rate:${id}:${userId}:${ip}`));
            const r1 = await do1.fetch(`https://do/limit?window=${windowSec}&limit=${perKeyLimit}`, { method: 'POST' });
            const rj1: any = await r1.json().catch(()=>({ allowed: true }));
            if (rj1?.allowed === false) {
              const retrySec = Math.max(1, Math.ceil((Number(rj1.resetAt||0) - Date.now())/1000));
              const h = new Headers({ 'content-type':'application/json', 'retry-after': String(retrySec) });
              return new Response(JSON.stringify({ error: 'rate_limited', scope: 'item', resetAt: rj1.resetAt }), { status: 429, headers: h });
            }
          } catch {}

          // user-scope
          const perUser = Number(env.RATE_LIMIT_DOWNLOAD_PER_USER_PER_MINUTE || 5);
          if (perUser > 0) {
            try {
              const windowSec = 60;
              const do2 = env.RATE_LIMITER_DO.get(env.RATE_LIMITER_DO.idFromName(`rate-user:${userId}`));
              const r2 = await do2.fetch(`https://do/limit?window=${windowSec}&limit=${perUser}`, { method: 'POST' });
              const rj2: any = await r2.json().catch(()=>({ allowed: true }));
              if (rj2?.allowed === false) {
                const retrySec = Math.max(1, Math.ceil((Number(rj2.resetAt||0) - Date.now())/1000));
                const h = new Headers({ 'content-type':'application/json', 'retry-after': String(retrySec) });
                return new Response(JSON.stringify({ error: 'rate_limited', scope: 'user', resetAt: rj2.resetAt }), { status: 429, headers: h });
              }
            } catch {}
          }

          // global-scope
          const perGlobal = Number(env.RATE_LIMIT_GLOBAL_DOWNLOAD_PER_MINUTE || 100);
          if (perGlobal > 0) {
            try {
              const windowSec = 60;
              const do3 = env.RATE_LIMITER_DO.get(env.RATE_LIMITER_DO.idFromName(`rate-global`));
              const r3 = await do3.fetch(`https://do/limit?window=${windowSec}&limit=${perGlobal}`, { method: 'POST' });
              const rj3: any = await r3.json().catch(()=>({ allowed: true }));
              if (rj3?.allowed === false) {
                const retrySec = Math.max(1, Math.ceil((Number(rj3.resetAt||0) - Date.now())/1000));
                const h = new Headers({ 'content-type':'application/json', 'retry-after': String(retrySec) });
                return new Response(JSON.stringify({ error: 'rate_limited', scope: 'global', resetAt: rj3.resetAt }), { status: 429, headers: h });
              }
            } catch {}
          }

          // TTL
          const bodyIn: any = await req.json().catch(()=>({}));
          const wantTtlMin = Math.max(1, Number(bodyIn?.ttlMinutes || env.DEFAULT_DOWNLOAD_TTL_MINUTES || 15));
          const ttlMin = Math.min(wantTtlMin, Number(env.MAX_DOWNLOAD_TTL_MINUTES || 120));
          const expireAtMs = Date.now() + ttlMin * 60 * 1000;

          // token create
          const token = crypto.randomUUID().replace(/-/g,'');
          try {
            const tokenDo = env.RATE_LIMITER_DO.get(env.RATE_LIMITER_DO.idFromName(`dl-token:${token}`));
            await tokenDo.fetch('https://do/token/create', { method: 'POST', headers: { 'content-type':'application/json' }, body: JSON.stringify({ itemId: id, userId, fileKey, expireAtMs, oneTime: true }) });
          } catch {}

          const given = row.original_filename ?? row.originalFilename ?? '';
          const u = new URL('/api/file', url.origin);
          u.searchParams.set('t', token);
          u.searchParams.set('download', '1');
          if (given) u.searchParams.set('name', String(given));

          return new Response(JSON.stringify({ url: u.pathname + '?' + u.searchParams.toString(), ttlMinutes: ttlMin }), { headers: { 'content-type': 'application/json' } });
        } catch (e: any) {
          return new Response(JSON.stringify({ error: 'internal', message: String(e?.message || e) }), { status: 500, headers: { 'content-type': 'application/json' } });
        }
      }
    }

    // Create report (logged-in; item may be public or private if owner)
    {
      if (url.pathname === '/api/reports' && req.method === 'POST') {
        const authed = await getAuthUser(req, env);
        if (!authed) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
        const uid = String((authed as any)?.id || '');
        try {
          await ensureTables(env);
          const body: any = await req.json().catch(()=>({}));
          const itemId = String(body?.itemId || '').trim();
          const reason = String(body?.reason || '').trim().slice(0, 1000);
          if (!itemId) return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers: { 'content-type': 'application/json' } });
          // basic existence check (avoid referencing non-existent columns)
          const row: any = await env.DB.prepare(`SELECT * FROM items WHERE id = ? LIMIT 1`).bind(itemId).first();
          if (!row) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'content-type': 'application/json' } });
          // create report
          const id = crypto.randomUUID();
          const nowIso = new Date().toISOString();
          await env.DB.prepare(`INSERT INTO reports (id, itemId, reporterUserId, reason, createdAt, status) VALUES (?, ?, ?, ?, ?, 'open')`)
            .bind(id, itemId, uid, reason, nowIso).run();
          // Discord webhook notify (best-effort)
          let notified = false; let notifyStatus = 0;
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
                  color: 0xFFAA00,
                  fields: [
                    { name: 'Item', value: `[${itemId}](${itemUrl})`, inline: false },
                    { name: 'Reporter', value: uid, inline: true },
                    { name: 'Time', value: nowIso, inline: true }
                  ]
                }
              ]
            };
            try {
              const resp = await fetch(hook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
              notifyStatus = resp.status;
              notified = resp.ok || resp.status === 204;
            } catch {}
          }
          return new Response(JSON.stringify({ ok: true, id, notified, notifyStatus }), { headers: { 'content-type': 'application/json' } });
        } catch (e: any) {
          return new Response(JSON.stringify({ error: 'internal', message: String(e?.message || e) }), { status: 500, headers: { 'content-type': 'application/json' } });
        }
      }
    }

    // --- DEBUG endpoints (development only) ---
    if (url.pathname.startsWith('/api/debug/')) {
      if (String(env.ENVIRONMENT || '').toLowerCase() !== 'development') {
        return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'content-type': 'application/json' } });
      }
      const authed = await getAuthUser(req, env);
      if (!authed) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });

      // /api/debug/rate?scope=item&itemId=...&userId=...&ip=...
      // /api/debug/rate?scope=user&userId=...
      // /api/debug/rate?scope=global
      // /api/debug/rate?name=raw-do-name
      if (url.pathname === '/api/debug/rate' && req.method === 'GET') {
        try {
          let name = url.searchParams.get('name') || '';
          if (!name) {
            const scope = String(url.searchParams.get('scope') || 'item');
            if (scope === 'item') {
              const itemId = String(url.searchParams.get('itemId') || '');
              const userId = String(url.searchParams.get('userId') || '');
              const ip = String(url.searchParams.get('ip') || req.headers.get('cf-connecting-ip') || '0.0.0.0');
              if (!itemId || !userId) return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers: { 'content-type': 'application/json' } });
              name = `rate:${itemId}:${userId}:${ip}`;
            } else if (scope === 'user') {
              const userId = String(url.searchParams.get('userId') || '');
              if (!userId) return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers: { 'content-type': 'application/json' } });
              name = `rate-user:${userId}`;
            } else if (scope === 'global') {
              name = 'rate-global';
            }
          }
          if (!name) return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers: { 'content-type': 'application/json' } });
          const id = env.RATE_LIMITER_DO.idFromName(name);
          const stub = env.RATE_LIMITER_DO.get(id);
          const resp = await stub.fetch('https://do/debug/rl');
          const j = await resp.json().catch(()=>null);
          return new Response(JSON.stringify({ name, debug: j }), { headers: { 'content-type': 'application/json' } });
        } catch (e: any) {
          return new Response(JSON.stringify({ error: 'internal', message: String(e?.message || e) }), { status: 500, headers: { 'content-type': 'application/json' } });
        }
      }

      // /api/debug/token?t=...
      if (url.pathname === '/api/debug/token' && req.method === 'GET') {
        try {
          const t = String(url.searchParams.get('t') || '');
          if (!t) return new Response(JSON.stringify({ error: 'bad_request' }), { status: 400, headers: { 'content-type': 'application/json' } });
          const id = env.RATE_LIMITER_DO.idFromName(`dl-token:${t}`);
          const stub = env.RATE_LIMITER_DO.get(id);
          const resp = await stub.fetch('https://do/debug/token');
          const j = await resp.json().catch(()=>null);
          return new Response(JSON.stringify({ token: t, debug: j }), { headers: { 'content-type': 'application/json' } });
        } catch (e: any) {
          return new Response(JSON.stringify({ error: 'internal', message: String(e?.message || e) }), { status: 500, headers: { 'content-type': 'application/json' } });
        }
      }
    }

    if (url.pathname === '/api/file' && req.method === 'GET') {
      // protect file fetch behind login; allow token-based retrieval of key
      const user = await getAuthUser(req, env);
      if (!user) return new Response('unauthorized', { status: 401 });

      let key = url.searchParams.get('k');
      const token = url.searchParams.get('t') || '';
      if (token && !key) {
        try {
          const stub = env.RATE_LIMITER_DO.get(env.RATE_LIMITER_DO.idFromName(`dl-token:${token}`));
          const resp = await stub.fetch('https://do/token/get', { method: 'GET' });
          const dat: any = await resp.json().catch(()=>null);
          if (!dat || !dat.fileKey || dat.expireAtMs < Date.now() || dat.used) return new Response('expired', { status: 410 });
          key = dat.fileKey;
          // one-time consume
          try { await stub.fetch('https://do/token/consume', { method: 'POST' }); } catch {}
        } catch {
          return new Response('expired', { status: 410 });
        }
      }
      if (!key) return new Response('missing k', { status: 400 });
      try {
        const obj = await env.R2.get(key);
        if (!obj) return new Response('not found', { status: 404 });
        const headers = new Headers();
        const ct = obj.httpMetadata?.contentType || 'application/octet-stream';
        headers.set('content-type', ct);
        headers.set('cache-control', 'private, max-age=3600');
        if (obj.httpEtag) headers.set('etag', obj.httpEtag);
        if (typeof (obj as any).size === 'number') headers.set('content-length', String((obj as any).size));
        const dl = url.searchParams.get('download');
        const given = url.searchParams.get('name') || '';
        const fallback = key.split('/').pop() || 'download';
        const filename = given || fallback;
        const dispo = dl ? 'attachment' : 'inline';
        headers.set('content-disposition', `${dispo}; filename="${filename}"`);
        // 人気順のためにダウンロード開始でカウント（download パラメータが付与された場合のみ）
        if (dl) {
          // カウント前にテーブル/列を確実に準備
          try { await ensureTables(env); } catch {}
          try {
            let itemId: any = null;
            // まず file_key で検索（標準列）
            try {
              const r1: any = await env.DB.prepare(`SELECT id FROM items WHERE file_key = ? LIMIT 1`).bind(key).first();
              itemId = r1?.id ?? r1?.ID ?? null;
            } catch {}
            // 見つからない/エラー時は旧スキーマ fileKey を試す
            if (!itemId) {
              try {
                const r2: any = await env.DB.prepare(`SELECT id FROM items WHERE fileKey = ? LIMIT 1`).bind(key).first();
                itemId = r2?.id ?? r2?.ID ?? null;
              } catch {}
            }
            if (itemId) {
              // 重複防止: 同一IP×同一アイテムで一定時間内の重複カウントを抑止
              const ip = req.headers.get('cf-connecting-ip') || '0.0.0.0';
              const name = `dl:${itemId}:${ip}`;
              try {
                const id = env.RATE_LIMITER_DO.idFromName(name);
                const stub = env.RATE_LIMITER_DO.get(id);
                const allowRes = await stub.fetch('https://do/check?ttl=3600', { method: 'POST' });
                const allowJson: any = await allowRes.json().catch(()=>({allowed:true}));
                if (allowJson?.allowed !== false) {
                  await env.DB.prepare(`UPDATE items SET downloadCount = COALESCE(downloadCount, 0) + 1 WHERE id = ?`).bind(itemId).run();
                }
              } catch {
                // DO失敗時はフォールバックでカウント（ユーザー体験を優先）
                try { await env.DB.prepare(`UPDATE items SET downloadCount = COALESCE(downloadCount, 0) + 1 WHERE id = ?`).bind(itemId).run(); } catch {}
              }
            }
          } catch {}
        }
        return new Response(obj.body, { headers });
      } catch {
        return new Response('error', { status: 500 });
      }
    }

    // Debug endpoints removed

    if (url.pathname === '/api/thumbnail' && req.method === 'GET') {
      // protect thumbnail behind login (要ログイン仕様)
      const user = await getAuthUser(req, env);
      if (!user) return html(layout('ログインが必要です', `<h1 class=\"text-lg font-semibold\">ログインが必要です</h1><p class=\"text-gray-500 text-sm mt-1\">右上の「ログイン」から認証してください。</p>`, { isLoggedIn: false, auth: { supaUrl: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY } }));
      const key = url.searchParams.get('k');
      if (!key) return new Response('missing k', { status: 400 });
      try {
        const obj = await env.R2.get(key);
        if (!obj) return placeholderPng();
        const headers = new Headers();
        const ct = obj.httpMetadata?.contentType || 'image/jpeg';
        headers.set('content-type', ct);
        headers.set('cache-control', 'public, max-age=3600');
        if (obj.httpEtag) headers.set('etag', obj.httpEtag);
        return new Response(obj.body, { headers });
      } catch {
        return placeholderPng();
      }
    }

    // minimal API: 未実装エンドポイントは 404
    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'content-type': 'application/json' } });
    }

    // server-rendered minimal pages (after auth gate)
    if (req.method === 'GET') {
    if (url.pathname === '/' || url.pathname === '/items') return renderItems(env, url, req);
      const m = /^\/items\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
      if (m) return renderItem(env, m[1], req);
      const mu = /^\/u\/([a-z0-9]{3,32})$/.exec(url.pathname);
      if (mu) return renderUser(env, mu[1], req);
      if (url.pathname === '/upload') return renderUpload(env, req);
    }

    // static assets then fallback
    const res = await env.ASSETS.fetch(req);
    if (res.status !== 404) return res;
    if ((req.headers.get('accept') || '').includes('text/html')) {
      return env.ASSETS.fetch(new Request(new URL('/index.html', url.origin), req));
    }
    return res;
  },
} satisfies ExportedHandler<Env>;

// Minimal Durable Object stub to satisfy existing bindings
export class RateLimiter implements DurableObject {
  state: DurableObjectState;
  constructor(state: DurableObjectState) {
    this.state = state;
  }
  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (request.method === 'POST' && url.pathname === '/check') {
        // body: TTL秒のメモ化チェック（URLクエリまたはデフォルト60秒）
        const ttl = Number(url.searchParams.get('ttl') || '3600');
        const key = 'check:hit';
        const prev = await this.state.storage.get<number>(key);
        const now = Date.now();
        if (prev && now - prev < ttl * 1000) {
          return new Response(JSON.stringify({ allowed: false }), { headers: { 'content-type': 'application/json' } });
        }
        await this.state.storage.put(key, now);
        return new Response(JSON.stringify({ allowed: true }), { headers: { 'content-type': 'application/json' } });
      }

      // Fixed window rate limit per DO instance
      if (request.method === 'POST' && url.pathname === '/limit') {
        const windowSec = Math.max(1, Number(url.searchParams.get('window') || '60'));
        const limit = Math.max(1, Number(url.searchParams.get('limit') || '10'));
        const now = Date.now();
        const data = (await this.state.storage.get<any>('rl:data')) || null;
        let windowStart = data?.windowStart || 0;
        let count = data?.count || 0;
        if (!windowStart || now - windowStart >= windowSec * 1000) {
          windowStart = now;
          count = 0;
        }
        count += 1;
        const allowed = count <= limit;
        const resetAt = windowStart + windowSec * 1000;
        await this.state.storage.put('rl:data', { windowStart, count });
        return new Response(JSON.stringify({ allowed, remaining: Math.max(0, limit - count), resetAt }), { headers: { 'content-type': 'application/json' } });
      }

      // Token management for one-time download URLs
      if (url.pathname === '/token/create' && request.method === 'POST') {
        const body = await request.json().catch(()=>({}));
        const tokenData = {
          itemId: String((body as any)?.itemId || ''),
          userId: String((body as any)?.userId || ''),
          fileKey: String((body as any)?.fileKey || ''),
          expireAtMs: Number((body as any)?.expireAtMs || 0),
          oneTime: !!(body as any)?.oneTime,
          used: false as boolean,
        };
        await this.state.storage.put('dl:token', tokenData);
        return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
      }
      if (url.pathname === '/token/get' && request.method === 'GET') {
        const tokenData = await this.state.storage.get<any>('dl:token');
        return new Response(JSON.stringify(tokenData || null), { headers: { 'content-type': 'application/json' } });
      }
      if (url.pathname === '/token/consume' && request.method === 'POST') {
        const tokenData = (await this.state.storage.get<any>('dl:token')) || null;
        if (tokenData) {
          tokenData.used = true;
          await this.state.storage.put('dl:token', tokenData);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
      }

      // Debug views
      if (url.pathname === '/debug/rl' && request.method === 'GET') {
        const data = (await this.state.storage.get<any>('rl:data')) || null;
        return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
      }
      if (url.pathname === '/debug/token' && request.method === 'GET') {
        const data = (await this.state.storage.get<any>('dl:token')) || null;
        return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
      }
    } catch {}
    return new Response(JSON.stringify({ allowed: true }), { headers: { 'content-type': 'application/json' } });
  }
}

async function renderItems(env: Env, url: URL, req?: Request): Promise<Response> {
  // ヘッダー用ユーザー名（SSRで即時表示）
  let usernameForHeader = '';
  try {
    if (req) {
      const authed = await getAuthUser(req, env).catch(() => null);
      const uid = String((authed as any)?.id || '');
      if (uid) {
        try {
          const rowU: any = await env.DB.prepare(`SELECT username FROM users WHERE id = ? LIMIT 1`).bind(uid).first();
          let un = String(rowU?.username ?? rowU?.USERNAME ?? '');
          if (!/^[a-z0-9]{3,32}$/.test(un)) un = normalizeUsernameFromId(uid);
          usernameForHeader = un;
        } catch {
          usernameForHeader = normalizeUsernameFromId(uid);
        }
      }
    }
  } catch {}
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
  const pageSize = 20;
  const q = String(url.searchParams.get('q') || '').trim();
  const categoryParam = String(url.searchParams.get('category') || '').trim().toUpperCase();
  const tagParam = String(url.searchParams.get('tag') || '').trim();
  const sort = String(url.searchParams.get('sort') || 'new').trim();
  let items: any[] = [];
  let hasNext = false;
  const whereParts: string[] = ["visibility = 'public'"];
  const binds: any[] = [];
  if (categoryParam) { whereParts.push('(category = ? OR CATEGORY = ? OR UPPER(category) = ?)'); binds.push(categoryParam, categoryParam, categoryParam); }
  if (q) { whereParts.push('(title LIKE ? OR description LIKE ?)'); const like = `%${q}%`; binds.push(like, like); }
  if (tagParam) { whereParts.push(`id IN (SELECT it.itemId FROM item_tags it JOIN tags t ON t.id = it.tagId WHERE t.id = ? OR t.label = ?)`); binds.push(tagParam, tagParam); }
  let orderBy = "COALESCE(createdAt, created_at, '') DESC, rowid DESC";
  if (sort === 'popular') orderBy = "COALESCE(downloadCount, 0) DESC, COALESCE(createdAt, created_at, '') DESC, rowid DESC";
  try {
    const limit = pageSize + 1;
    const offset = (page - 1) * pageSize;
    const sql = `SELECT * FROM items WHERE ${whereParts.join(' AND ')} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
    const stmt = env.DB.prepare(sql).bind(...binds, limit, offset);
    const res: any = await stmt.all();
    const rows: any[] = res?.results ?? res ?? [];
    hasNext = rows.length > pageSize;
    items = rows.slice(0, pageSize).map((r: any) => ({
      id: r.id ?? r.ID,
      ownerUserId: r.ownerUserId ?? r.OWNERUSERID ?? r.owner_user_id ?? r.OWNER_USER_ID ?? '',
      title: r.title ?? r.TITLE ?? 'Untitled',
      category: r.category ?? r.CATEGORY ?? 'OTHER',
      visibility: r.visibility ?? r.VISIBILITY ?? 'public',
      originalFilename: r.original_filename ?? r.originalFilename ?? r.ORIGINAL_FILENAME ?? '',
      sizeBytes: Number(r.size_bytes ?? r.sizeBytes ?? r.SIZE_BYTES ?? 0),
      fileKey: r.file_key ?? r.fileKey ?? r.FILE_KEY ?? '',
      thumbnailKey: r.thumbnail_key ?? r.thumbnailKey ?? r.THUMBNAIL_KEY ?? '',
      createdAt: r.created_at ?? r.createdAt ?? r.CREATED_AT ?? null,
      downloadCount: Number(r.downloadCount ?? r.DOWNLOADCOUNT ?? r.download_count ?? 0),
      tags: (() => {
        const tj = r.tags_json ?? r.TAGS_JSON ?? null;
        if (tj) {
          try {
            const arr = JSON.parse(tj);
            if (Array.isArray(arr)) return arr.map((x: any) => String(x));
          } catch {}
        }
        const t = r.tags ?? r.TAGS ?? '';
        if (t) return String(t).split(',').map((s: string) => s.trim()).filter(Boolean);
        return [] as string[];
      })(),
    }));
  } catch (e: any) {
    const body = `<h1 class="text-lg font-semibold">一覧</h1>
    <p class="text-gray-500 text-sm">データ取得に失敗しました。テーブル未作成の可能性があります。</p>
    <pre class="text-gray-500 text-xs whitespace-pre-wrap">${escapeHtml(String(e?.message || e))}</pre>`;
    return html(layout('一覧', body, { isLoggedIn: true }));
  }

  // 補助: tags結合（ある場合）
  try {
    const ids = items.map((it) => it.id).filter(Boolean);
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      const sql = `SELECT it.itemId as id, GROUP_CONCAT(t.label, ',') as labels\n                   FROM item_tags it\n                   JOIN tags t ON t.id = it.tagId\n                   WHERE it.itemId IN (${placeholders})\n                   GROUP BY it.itemId`;
      const res2: any = await env.DB.prepare(sql).bind(...ids).all();
      const rows2: any[] = res2?.results ?? res2 ?? [];
      const idToTags: Record<string, string[]> = {};
      for (const r of rows2) {
        const rid = r.id ?? r.ID ?? r.itemId ?? r.ITEMID;
        const s = r.labels ?? r.LABELS ?? '';
        idToTags[String(rid)] = s ? String(s).split(',').map((x: string) => x.trim()).filter(Boolean) : [];
      }
      items = items.map((it) => ({ ...it, tags: idToTags[String(it.id)] ?? it.tags ?? [] }));
    }
  } catch {}

  const cards = items.map((it) => `
    <div class="border border-gray-200 rounded-lg p-3 bg-white">
      <div class="bg-gray-100 rounded-md overflow-hidden mb-2 aspect-square">
        <img class="w-full h-full object-cover block" src="${thumbnailUrl(it)}" alt="thumb" loading="lazy" />
      </div>
      <div class="flex justify-between items-center gap-2">
        <div class="font-semibold">${escapeHtml(it.title)}</div>
        <a class="inline-block px-3 py-1.5 border border-black rounded-md text-black hover:bg-black/5" href="/items/${escapeHtml(it.id)}">詳細</a>
      </div>
      <div class="text-gray-500 text-xs mt-1.5">${escapeHtml(it.category)}</div>
      <div class="text-gray-500 text-xs mt-1.5">DL: ${Number(it.downloadCount||0)}</div>
      ${it.tags && it.tags.length ? `<div class=\"mt-1.5 flex flex-wrap gap-1\">${it.tags.map((tg: any) => `<span class=\"text-xs px-2 py-0.5 rounded-full border border-gray-200\">#${escapeHtml(String(tg))}</span>`).join('')}</div>` : ''}
    </div>
  `).join('');

  const pager = `<div class="flex gap-2 mt-4">
    ${page > 1 ? `<a class=\"border border-gray-200 rounded-md px-3 py-1.5\" href="/items?page=${page - 1}">前へ</a>` : ''}
    ${hasNext ? `<a class=\"border border-gray-200 rounded-md px-3 py-1.5\" href="/items?page=${page + 1}">次へ</a>` : ''}
  </div>`;

  // フィルタフォーム（エスケープ過剰を避ける）
  let tagOptions = '';
  try {
    const tRes: any = await env.DB.prepare(`SELECT id, label FROM tags ORDER BY label COLLATE NOCASE LIMIT 100`).all();
    const tRows: any[] = tRes?.results ?? tRes ?? [];
    tagOptions = tRows.map((tr: any) => `<option value="${escapeHtml(tr.label ?? tr.LABEL ?? '')}"></option>`).join('');
  } catch {}
  const currentQ = escapeHtml(String(url.searchParams.get('q')||''));
  const currentCat = String(url.searchParams.get('category')||'').toUpperCase();
  const currentTag = escapeHtml(String(url.searchParams.get('tag')||''));
  const currentSort = String(url.searchParams.get('sort')||'new');
  const filters = `
  <form class="mt-2 mb-3 grid gap-2 md:grid-cols-4" method="get" action="/items">
    <input class="border border-gray-300 rounded-md px-3 py-2" name="q" placeholder="キーワード" value="${currentQ}"/>
    <select class="border border-gray-300 rounded-md px-3 py-2" name="category">
      <option value="">全カテゴリ</option>
      ${['IMAGE','VIDEO','MUSIC','VOICE','3D','OTHER'].map(c=>`<option value="${c}" ${currentCat===c?'selected':''}>${c}</option>`).join('')}
    </select>
    <input class="border border-gray-300 rounded-md px-3 py-2" name="tag" list="tags" placeholder="タグ" value="${currentTag}"/>
    <select class="border border-gray-300 rounded-md px-3 py-2" name="sort">
      <option value="new" ${currentSort==='new'?'selected':''}>新着</option>
      <option value="popular" ${currentSort==='popular'?'selected':''}>人気</option>
    </select>
    <div class="md:col-span-4"><button class="mt-1 inline-block px-4 py-2 border border-black rounded-md text-black hover:bg-black/5">絞り込み</button></div>
    <datalist id="tags">${tagOptions}</datalist>
  </form>`;

  const body = `<h1 class="text-lg font-semibold">一覧</h1>
    ${filters}
    <div class="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))] mt-3">${cards || '<div class="text-gray-500 text-sm">アイテムがありません</div>'}</div>
    ${pager}`;
  return html(layout('一覧', body, { isLoggedIn: true, username: usernameForHeader, auth: { supaUrl: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY } }));
}

async function renderItem(env: Env, id: string, req?: Request): Promise<Response> {
  // 1) 取得
  let row: any | null = null;
  try {
    const stmt = env.DB.prepare(`SELECT * FROM items WHERE id = ? LIMIT 1`).bind(id);
    const res: any = await stmt.first();
    row = res ?? null;
  } catch {}

  if (!row) {
    const body404 = `<h1 class="text-lg font-semibold">見つかりません</h1>
    <p class="text-gray-500 text-sm">アイテムが存在しないか、非公開です。</p>
    <p><a class="inline-block px-3 py-1.5 border border-black rounded-md text-black hover:bg-black/5" href="/items">一覧へ戻る</a></p>`;
    return html(layout('見つかりません', body404));
  }

  // 非公開アイテムは所有者のみ閲覧可
  try {
    const visibilityRaw = String(row.visibility ?? row.VISIBILITY ?? 'public').toLowerCase();
    const ownerId = row.ownerUserId ?? row.OWNERUSERID ?? row.owner_user_id ?? row.OWNER_USER_ID ?? '';
    if (visibilityRaw === 'private') {
      let viewerId = '';
      if (req) {
        const authed = await getAuthUser(req, env).catch(()=>null);
        viewerId = String((authed as any)?.id || '');
      }
      if (!viewerId || viewerId !== ownerId) {
        const body404 = `<h1 class=\"text-lg font-semibold\">見つかりません</h1>
        <p class=\"text-gray-500 text-sm\">アイテムが存在しないか、非公開です。</p>
        <p><a class=\"inline-block px-3 py-1.5 border border-black rounded-md text-black hover:bg-black/5\" href=\"/items\">一覧へ戻る</a></p>`;
        return html(layout('見つかりません', body404));
      }
    }
  } catch {}

  const it = {
    id: row.id ?? row.ID,
    ownerUserId: row.ownerUserId ?? row.OWNERUSERID ?? row.owner_user_id ?? row.OWNER_USER_ID ?? '',
    title: row.title ?? row.TITLE ?? 'Untitled',
    description: row.description ?? row.DESCRIPTION ?? '',
    prompt: row.prompt ?? row.PROMPT ?? '',
    category: row.category ?? row.CATEGORY ?? 'OTHER',
    visibility: row.visibility ?? row.VISIBILITY ?? 'public',
    originalFilename: row.original_filename ?? row.originalFilename ?? row.ORIGINAL_FILENAME ?? '',
    sizeBytes: Number(row.size_bytes ?? row.sizeBytes ?? row.SIZE_BYTES ?? 0),
    fileKey: row.file_key ?? row.fileKey ?? row.FILE_KEY ?? '',
    thumbnailKey: row.thumbnail_key ?? row.thumbnailKey ?? row.THUMBNAIL_KEY ?? '',
    contentType: row.contentType ?? row.CONTENTTYPE ?? row.CONTENT_TYPE ?? '',
    extension: row.extension ?? row.EXTENSION ?? '',
    downloadCount: Number(row.downloadCount ?? row.DOWNLOADCOUNT ?? row.download_count ?? 0),
    createdAt: row.created_at ?? row.CREATED_AT ?? row.createdAt ?? null,
  };

  // 2) UI
  // タグ取得
  let tags: string[] = [];
  try {
    const resT: any = await env.DB.prepare(
      `SELECT GROUP_CONCAT(t.label, ',') as labels
       FROM item_tags it JOIN tags t ON t.id = it.tagId
       WHERE it.itemId = ?`
    ).bind(it.id).first();
    const labels = resT?.labels ?? resT?.LABELS ?? '';
    tags = labels ? String(labels).split(',').map((s: string)=>s.trim()).filter(Boolean) : [];
  } catch {}

  const meta = `
  <div class="mt-2 text-sm">
    <div class="grid [grid-template-columns:100px_1fr] gap-x-3 gap-y-1">
      <div class="text-gray-500 text-xs">カテゴリ</div><div>${escapeHtml(it.category)}</div>
      <div class="text-gray-500 text-xs">タグ</div><div>${tags.length ? tags.map(t=>`<span class=\"inline-block text-xs px-2 py-0.5 rounded-full border border-gray-200 mr-1 mb-1\">#${escapeHtml(t)}</span>`).join('') : '-'}</div>
      <div class="text-gray-500 text-xs">サイズ</div><div>${formatBytes(it.sizeBytes)}</div>
      <div class="text-gray-500 text-xs">作成日</div><div>${formatDate(it.createdAt)}</div>
      <div class="text-gray-500 text-xs">ファイル名</div><div>${escapeHtml(it.originalFilename || '')}</div>
      <div class="text-gray-500 text-xs">ダウンロード</div><div>${Number(it.downloadCount||0)}</div>
    </div>
  </div>`;
  // 所有者向け: 公開/非公開トグル
  let ownerControls = '';
  try {
    let viewerId = '';
    if (req) {
      const authed = await getAuthUser(req, env).catch(()=>null);
      viewerId = String((authed as any)?.id || '');
    }
    if (viewerId && viewerId === it.ownerUserId) {
      const vis = String(it.visibility || '').toLowerCase() === 'public' ? 'public' : 'private';
      const btnLabel = vis === 'public' ? '非公開にする' : '公開する';
      ownerControls = `
      <button id=\"btnToggleVis\" class=\"inline-block px-3 py-1.5 border border-gray-700 rounded-md text-gray-800 hover:bg-black/5\" data-current=\"${vis}\">${btnLabel}</button>
      <span id=\"visStatus\" class=\"text-xs text-gray-500 ml-1\">現在: ${vis === 'public' ? '公開' : '非公開'}</span>`;
    }
  } catch {}

  const actions = `
  <div class="flex gap-2 flex-wrap mt-2.5">
    <button id="btnDl" class="inline-block px-3 py-1.5 border border-black rounded-md text-black hover:bg-black/5">ダウンロード</button>
    ${ownerControls}
    ${ownerControls ? '<button id="btnDelete" class="inline-block px-3 py-1.5 border border-red-600 text-red-700 rounded-md hover:bg-red-50">削除</button>' : ''}
    <button id="btnReport" class="inline-block px-3 py-1.5 border border-amber-600 text-amber-700 rounded-md hover:bg-amber-50">通報</button>
  </div>`;

  const desc = it.description ? `<div class="mt-4"><div class=\"text-gray-500 text-xs mb-1\">説明</div><p class="whitespace-pre-wrap">${escapeHtml(it.description)}</p></div>` : '';
  const prm = it.prompt ? `<div class=\"mt-4\"><div class=\"flex items-center justify-between\"><div class=\"text-gray-500 text-xs mb-1\">Prompt</div><button id=\"btnCopyPrompt\" class=\"inline-block px-2 py-1 text-xs border border-black rounded-md text-black hover:bg-black/5\">コピー</button></div><pre id=\"promptText\" class=\"whitespace-pre-wrap text-sm\">${escapeHtml(it.prompt)}</pre>
  <div class=\"mt-3\">\n    <div class=\"text-gray-500 text-xs mb-1\">共有</div>\n    <div class=\"flex items-center gap-2\">\n      <a id=\"btnShareX\" class=\"inline-flex items-center justify-center w-9 h-9 rounded-md border border-gray-300 text-gray-700 hover:bg-black/5\" target=\"_blank\" rel=\"noreferrer\" href=\"#\" title=\"Xでシェア\"><i class=\"fa-brands fa-x-twitter\"></i></a>\n      <a id=\"btnShareLine\" class=\"inline-flex items-center justify-center w-9 h-9 rounded-md border border-gray-300 text-gray-700 hover:bg-black/5\" target=\"_blank\" rel=\"noreferrer\" href=\"#\" title=\"LINEでシェア\"><i class=\"fa-brands fa-line\"></i></a>\n      <a id=\"btnShareFb\" class=\"inline-flex items-center justify-center w-9 h-9 rounded-md border border-gray-300 text-gray-700 hover:bg-black/5\" target=\"_blank\" rel=\"noreferrer\" href=\"#\" title=\"Facebookでシェア\"><i class=\"fa-brands fa-facebook\"></i></a>\n      <button id=\"btnCopyUrl\" class=\"group relative inline-flex items-center justify-center w-9 h-9 rounded-md border border-black text-black hover:bg-black/5\" title=\"クリックでコピー\"><i class=\"fa-solid fa-link\"></i><span class=\"pointer-events-none absolute -top-7 opacity-0 group-hover:opacity-100 transition bg-black text-white text-[10px] rounded px-2 py-0.5\">コピー</span></button>\n    </div>\n  </div>
  </div>` : '';

  // ヘッダー用ユーザー名（SSRで即時表示）
  let usernameForHeader = '';
  try {
    if (req) {
      const authed2 = await getAuthUser(req, env).catch(() => null);
      const uid2 = String((authed2 as any)?.id || '');
      if (uid2) {
        try {
          const rowU2: any = await env.DB.prepare(`SELECT username FROM users WHERE id = ? LIMIT 1`).bind(uid2).first();
          let un2 = String(rowU2?.username ?? rowU2?.USERNAME ?? '');
          if (!/^[a-z0-9]{3,32}$/.test(un2)) un2 = normalizeUsernameFromId(uid2);
          usernameForHeader = un2;
        } catch {
          usernameForHeader = normalizeUsernameFromId(uid2);
        }
      }
    }
  } catch {}

  const body = `
  <div class="flex items-start gap-4">
    <div class="flex-1">
      ${mediaMarkup(it)}
    </div>
    <div class="flex-1 min-w-[280px]">
      <h1 class="text-lg font-semibold">${escapeHtml(it.title)}</h1>
      ${meta}
      ${actions}
      ${desc}
      ${prm}
    </div>
  </div>
  <script>
  (function(){
    // 動的にSNSリンクのURLを補完（SSR時のorigin不定対策）
    try{
      const u = encodeURIComponent(location.href);
      const t = encodeURIComponent(document.title||'');
      const x = document.getElementById('btnShareX');
      const l = document.getElementById('btnShareLine');
      const f = document.getElementById('btnShareFb');
      if (x) x.setAttribute('href', 'https://x.com/intent/tweet?url=' + u + '&text=' + t);
      if (l) l.setAttribute('href', 'https://line.me/R/msg/text/?' + t + '%20' + u);
      if (f) f.setAttribute('href', 'https://www.facebook.com/sharer/sharer.php?u=' + u);
    }catch{}
    const btnCopyPrompt=document.getElementById('btnCopyPrompt');
    const promptEl=document.getElementById('promptText');
    btnCopyPrompt?.addEventListener('click',async()=>{
      try{ const text=(promptEl?.textContent||''); await navigator.clipboard.writeText(text); btnCopyPrompt.textContent='コピーしました'; setTimeout(()=>btnCopyPrompt.textContent='コピー',1500);}catch{}
    });
    const btnCopyUrl=document.getElementById('btnCopyUrl');
    btnCopyUrl?.addEventListener('click', async()=>{
      try{ await navigator.clipboard.writeText(location.href); const prev=btnCopyUrl.getAttribute('title')||''; btnCopyUrl.setAttribute('title','コピーしました'); setTimeout(()=>btnCopyUrl.setAttribute('title', prev||'クリックでコピー'), 1500);}catch{}
    });
    // download via API to get short-lived URL
    const btnDl=document.getElementById('btnDl');
    btnDl?.addEventListener('click', async()=>{
      try{
        const itemId='${escapeHtml(String(it.id))}';
        const fallbackName = ${JSON.stringify(String((it as any).originalFilename || (it as any).title || 'download'))};
        const fallbackUrl = '/api/file?k=' + encodeURIComponent('${escapeHtml(String(it.fileKey))}') + '&download=1&name=' + encodeURIComponent(fallbackName);
        btnDl.setAttribute('disabled','true');
        const res = await fetch('/api/items/' + encodeURIComponent(itemId) + '/download-url', { method:'POST', headers:{'content-type':'application/json','accept':'application/json'}, credentials:'same-origin' });
        const ct = res.headers.get('content-type')||'';
        const j = ct.includes('application/json') ? (await res.json().catch(()=>({}))) : {};
        if (res.ok && j?.url) { location.href = j.url; return; }
        if (res.status === 401) { location.href='/?login=1'; return; }
        if (res.status === 403) { alert('このアイテムは非公開です（または権限がありません）'); btnDl.removeAttribute('disabled'); return; }
        if (res.status === 404) { alert('アイテムが見つかりません'); btnDl.removeAttribute('disabled'); return; }
        if (res.status === 429) {
          const retry = Number(res.headers.get('retry-after')||'0');
          alert('ダウンロードの回数制限に達しました。' + (retry? ('約'+retry+'秒後に再試行してください。') : 'しばらくしてから再試行してください。'));
          btnDl.removeAttribute('disabled');
          return;
        }
        // fallback
        location.href = fallbackUrl;
      }catch{ btnDl.removeAttribute('disabled'); }
    });
    // toggle visibility for owner
    const btnToggle = document.getElementById('btnToggleVis');
    btnToggle?.addEventListener('click', async()=>{
      try{
        btnToggle.setAttribute('disabled','true');
        const cur = String(btnToggle.getAttribute('data-current')||'private');
        const nextVis = cur === 'public' ? 'private' : 'public';
        const res = await fetch('/api/items/' + encodeURIComponent('${escapeHtml(String(it.id))}') + '/publish', {
          method:'POST',
          headers:{'content-type':'application/json','accept':'application/json'},
          body: JSON.stringify({ visibility: nextVis })
        });
        if (res.ok) { location.reload(); return; }
        if (res.status === 403) { alert('権限がありません'); btnToggle.removeAttribute('disabled'); return; }
        if (res.status === 404) { alert('アイテムが見つかりません'); btnToggle.removeAttribute('disabled'); return; }
        if (res.status === 401) { location.href='/?login=1'; return; }
        alert('更新に失敗しました');
      }catch{ btnToggle?.removeAttribute('disabled'); }
    });
    const btnDelete = document.getElementById('btnDelete');
    btnDelete?.addEventListener('click', async()=>{
      try{
        if (!confirm('このアイテムを削除します。よろしいですか？')) return;
        btnDelete.setAttribute('disabled','true');
        const res = await fetch('/api/items/' + encodeURIComponent('${escapeHtml(String(it.id))}'), { method:'DELETE', headers:{'accept':'application/json'} });
        if (res.ok) { location.href = '/items'; return; }
        if (res.status === 403) { alert('権限がありません'); btnDelete.removeAttribute('disabled'); return; }
        if (res.status === 404) { alert('アイテムが見つかりません'); btnDelete.removeAttribute('disabled'); return; }
        if (res.status === 401) { location.href='/?login=1'; return; }
        alert('削除に失敗しました');
      }catch{ btnDelete?.removeAttribute('disabled'); }
    });
    const btnReport = document.getElementById('btnReport');
    btnReport?.addEventListener('click', async()=>{
      try{
        const reason = prompt('通報理由を入力してください（任意）') || '';
        const res = await fetch('/api/reports', { method:'POST', headers:{'content-type':'application/json','accept':'application/json'}, body: JSON.stringify({ itemId: '${escapeHtml(String(it.id))}', reason }) });
        if (res.ok) { alert('通報を受け付けました。ありがとうございます。'); return; }
        if (res.status === 401) { location.href='/?login=1'; return; }
        alert('通報に失敗しました');
      }catch{}
    });
  })();
  </script>
  `;
  return html(layout(it.title || '詳細', body, { isLoggedIn: true, username: usernameForHeader, auth: { supaUrl: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY } }));
}

async function renderUser(env: Env, username: string, req?: Request): Promise<Response> {
  // ビューア情報
  let viewerId = '';
  if (req) {
    try {
      const authed = await getAuthUser(req, env).catch(()=>null);
      viewerId = String((authed as any)?.id || '');
    } catch {}
  }

  // 対象ユーザーの特定（本人ページなら正規化ユーザー名で一致を確認し viewerId を採用）
  let targetUser: any | null = null;
  try {
    const normViewer = viewerId ? normalizeUsernameFromId(viewerId) : '';
    if (viewerId && normViewer && normViewer === username) {
      const res: any = await env.DB.prepare(`SELECT * FROM users WHERE id = ? LIMIT 1`).bind(viewerId).first();
      targetUser = res ?? null;
      if (!targetUser) {
        // 万一行が無ければ作成
        await env.DB.prepare(`INSERT OR IGNORE INTO users (id, username, displayName) VALUES (?, ?, ?)`)
          .bind(viewerId, normViewer, '').run();
        const r2: any = await env.DB.prepare(`SELECT * FROM users WHERE id = ? LIMIT 1`).bind(viewerId).first();
        targetUser = r2 ?? null;
      }
    } else {
      const res: any = await env.DB.prepare(`SELECT * FROM users WHERE username = ? LIMIT 1`).bind(username).first();
      targetUser = res ?? null;
    }
  } catch {}
  if (!targetUser) {
    const body404 = `<h1 class=\"text-lg font-semibold\">ユーザーが見つかりません</h1>
    <p class=\"text-gray-500 text-sm\">指定のユーザーは存在しません。</p>
    <p><a class=\"inline-block px-3 py-1.5 border border-black rounded-md text-black hover:bg-black/5\" href=\"/items\">一覧へ戻る</a></p>`;
    return html(layout('見つかりません', body404));
  }

  const uid = targetUser.id ?? targetUser.ID ?? '';
  const display = targetUser.displayName ?? targetUser.DISPLAYNAME ?? username;

  // アイテム取得（本人閲覧時は非公開も含める）
  let items: any[] = [];
  try {
    const isOwnerView = viewerId && viewerId === uid;
    const whereVis = isOwnerView ? '1=1' : "(visibility = 'public' OR VISIBILITY = 'public')";
    // 実在する所有者カラムを検出して条件を構築
    const ownerConds: string[] = [];
    const binds: any[] = [];
    try {
      const info: any = await env.DB.prepare(`PRAGMA table_info(items)`).all();
      const rowsInfo: any[] = info?.results ?? info ?? [];
      const names = new Set<string>(rowsInfo.map((r: any) => String(r.name ?? r.NAME ?? '').toLowerCase()));
      if (names.has('owneruserid')) { ownerConds.push('ownerUserId = ?'); binds.push(uid); }
      if (names.has('owner_user_id')) { ownerConds.push('owner_user_id = ?'); binds.push(uid); }
    } catch {}
    if (!ownerConds.length) { ownerConds.push('ownerUserId = ?'); binds.push(uid); }
    const sql = `SELECT *, COALESCE(createdAt, created_at, updatedAt, updated_at, '') as created_order
                 FROM items
                 WHERE (${ownerConds.join(' OR ')}) AND ${whereVis}
                 ORDER BY created_order DESC, rowid DESC LIMIT 100`;
    const res: any = await env.DB.prepare(sql).bind(...binds).all();
    const rows: any[] = res?.results ?? res ?? [];
    items = rows.map((r: any) => ({
      id: r.id ?? r.ID,
      title: r.title ?? r.TITLE ?? 'Untitled',
      category: r.category ?? r.CATEGORY ?? 'OTHER',
      downloadCount: Number(r.downloadCount ?? r.DOWNLOADCOUNT ?? r.download_count ?? 0),
      fileKey: r.file_key ?? r.fileKey ?? r.FILE_KEY ?? '',
      thumbnailKey: r.thumbnail_key ?? r.thumbnailKey ?? r.THUMBNAIL_KEY ?? '',
      contentType: r.contentType ?? r.CONTENTTYPE ?? r.CONTENT_TYPE ?? '',
    }));
  } catch {}

  const cards = items.map((it) => `
    <div class="border border-gray-200 rounded-lg p-3 bg-white">
      <div class="bg-gray-100 rounded-md overflow-hidden mb-2 aspect-square">
        <img class="w-full h-full object-cover block" src="${thumbnailUrl(it)}" alt="thumb" loading="lazy" />
      </div>
      <div class="flex justify-between items-center gap-2">
        <div class="font-semibold">${escapeHtml(it.title)}</div>
        <a class="inline-block px-3 py-1.5 border border-black rounded-md text-black hover:bg-black/5" href="/items/${escapeHtml(it.id)}">詳細</a>
      </div>
      <div class="text-gray-500 text-xs mt-1.5">${escapeHtml(it.category)}</div>
      <div class="text-gray-500 text-xs mt-1.5">DL: ${Number(it.downloadCount||0)}</div>
    </div>
  `).join('');

  // ヘッダー用ユーザー名（SSRで即時表示）
  let usernameForHeader = '';
  try {
    if (req) {
      const authed = await getAuthUser(req, env).catch(()=>null);
      const uid = String((authed as any)?.id || '');
      if (uid) {
        try {
          const rowU: any = await env.DB.prepare(`SELECT username FROM users WHERE id = ? LIMIT 1`).bind(uid).first();
          let un = String(rowU?.username ?? rowU?.USERNAME ?? '');
          if (!/^[a-z0-9]{3,32}$/.test(un)) un = normalizeUsernameFromId(uid);
          usernameForHeader = un;
        } catch {
          usernameForHeader = normalizeUsernameFromId(uid);
        }
      }
    }
  } catch {}

  const body = `
  <div>
    <h1 class="text-lg font-semibold">${escapeHtml(display)} の作品</h1>
    <div class="text-gray-500 text-sm">@${escapeHtml(username)}</div>
    <div class="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))] mt-3">${cards || '<div class="text-gray-500 text-sm">アイテムがありません</div>'}</div>
  </div>`;
  return html(layout(`${display} の作品`, body, { isLoggedIn: true, username: usernameForHeader, auth: { supaUrl: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY } }));
}

function mediaMarkup(it: any): string {
  const cat = String(it.category || '').toUpperCase();
  const fileSrc = fileUrl(it);
  const thumb = thumbnailUrl(it);
  if (cat === 'IMAGE') {
    return `<div class="bg-gray-100 rounded-md overflow-hidden mb-2"><img class="w-full h-auto block" src="${fileSrc}" alt="image" loading="lazy" /></div>`;
  }
  if (cat === 'VIDEO') {
    const poster = it.thumbnailKey ? ` poster=\"${thumb}\"` : '';
    return `<div class=\"bg-gray-100 rounded-md overflow-hidden mb-2\"><video class=\"w-full h-auto\" controls playsinline preload=\"metadata\"${poster}><source src=\"${fileSrc}\" type=\"${escapeHtml(it.contentType || 'video/mp4')}\" /></video></div>`;
  }
  if (cat === 'MUSIC' || cat === 'VOICE') {
    const img = it.thumbnailKey ? `<img class=\"w-16 h-16 object-cover rounded\" src=\"${thumb}\" alt=\"thumb\" />` : '';
    return `<div class="bg-gray-50 rounded-md p-3 mb-2 flex items-center gap-3">${img}<audio controls preload="metadata" class="w-full"><source src="${fileSrc}" type="${escapeHtml(it.contentType || 'audio/mpeg')}" /></audio></div>`;
  }
  // 3D / OTHER -> show thumbnail if any else placeholder (thumbnailUrl already handles fallback/icon)
  return `<div class="bg-gray-100 rounded-md overflow-hidden mb-2"><img class="w-full h-auto block" src="${thumb}" alt="preview" loading="lazy" /></div>`;
}

async function renderUpload(env: Env, req?: Request): Promise<Response> {
  // ヘッダー用ユーザー名（SSRで即時表示）
  let usernameForHeader = '';
  try {
    if (req) {
      const authed = await getAuthUser(req, env).catch(() => null);
      const uid = String((authed as any)?.id || '');
      if (uid) {
        try {
          const rowU: any = await env.DB.prepare(`SELECT username FROM users WHERE id = ? LIMIT 1`).bind(uid).first();
          let un = String(rowU?.username ?? rowU?.USERNAME ?? '');
          if (!/^[a-z0-9]{3,32}$/.test(un)) un = normalizeUsernameFromId(uid);
          usernameForHeader = un;
        } catch {
          usernameForHeader = normalizeUsernameFromId(uid);
        }
      }
    }
  } catch {}
  // 既存タグ取得
  let tagRows: any[] = [];
  try {
    const res: any = await env.DB.prepare(`SELECT id, label FROM tags ORDER BY label COLLATE NOCASE LIMIT 200`).all();
    tagRows = res?.results ?? res ?? [];
  } catch {}
  const tagChips = tagRows.map((r) => {
    const label = r.label ?? r.LABEL ?? '';
    return `<button type=\"button\" class=\"px-2 py-0.5 text-xs border border-gray-300 rounded-full hover:bg-gray/5 tag-chip\" data-label=\"${escapeHtml(label)}\">#${escapeHtml(label)}</button>`;
  }).join('');

  const body = `<h1 class="text-lg font-semibold">アップロード</h1>
  <form id="uploadForm" class="mt-3 space-y-3" method="post" action="/api/upload" enctype="multipart/form-data">
    <div>
      <label class="block text-xs text-gray-600 mb-1">タイトル（必須）</label>
      <input name="title" required class="w-full border border-gray-300 rounded-md px-3 py-2" />
    </div>
    <div>
      <label class="block text-xs text-gray-600 mb-1">カテゴリー（必須）</label>
      <select name="category" required class="w-full border border-gray-300 rounded-md px-3 py-2">
        <option value="IMAGE">画像</option>
        <option value="VIDEO">動画</option>
        <option value="MUSIC">音楽</option>
        <option value="VOICE">音声</option>
        <option value="3D">3Dモデル</option>
        <option value="OTHER">その他</option>
      </select>
    </div>
    <div>
      <label class="block text-xs text-gray-600 mb-1">公開範囲</label>
      <select name="visibility" class="w-full border border-gray-300 rounded-md px-3 py-2">
        <option value="private">非公開</option>
        <option value="public">公開</option>
      </select>
    </div>
    <div>
      <label class="block text-xs text-gray-600 mb-1">説明</label>
      <textarea name="description" rows="3" class="w-full border border-gray-300 rounded-md px-3 py-2"></textarea>
    </div>
    <div>
      <label class="block text-xs text-gray-600 mb-1">Prompt</label>
      <textarea name="prompt" rows="3" class="w-full border border-gray-300 rounded-md px-3 py-2"></textarea>
    </div>
    <div>
      <label class="block text-xs text-gray-600 mb-1">タグ（最大5・3〜20文字）</label>
      <input name="tags" id="tagsInput" placeholder="カンマ区切りまたは下の一覧から選択" class="w-full border border-gray-300 rounded-md px-3 py-2" />
      <div class="mt-2 text-xs text-gray-500">登録済みタグ（クリックで追加）</div>
      <div class="mt-1 flex flex-wrap gap-1" id="tagList">${tagChips || '<span class=\"text-xs text-gray-400\">（タグ未登録）</span>'}</div>
    </div>
    <div>
      <label class="block text-xs text-gray-600 mb-1">本体ファイル（必須）</label>
      <input name="file" id="fileInput" type="file" required class="block" />
    </div>
    <div>
      <label class="block text-xs text-gray-600 mb-1">サムネイル（任意）</label>
      <input name="thumbnail" type="file" accept="image/*" class="block" />
    </div>
    <div class="pt-2">
      <button class="inline-block px-4 py-2 border border-black rounded-md text-black hover:bg-black/5">アップロード</button>
    </div>
  </form>
  <div id="progressTip" class="fixed bottom-4 right-4 w-72 shadow-lg rounded-md border border-gray-200 bg-white hidden">
    <div class="px-3 py-2 border-b border-gray-100 flex justify-between items-center">
      <div class="text-sm font-medium">アップロード中</div>
      <button id="tipClose" class="text-gray-400 hover:text-gray-600 text-xs">閉じる</button>
    </div>
    <div class="p-3">
      <div class="h-2 bg-gray-100 rounded overflow-hidden"><div id="prog" class="bg-blue-500 h-2 w-0"></div></div>
      <div id="status" class="text-xs text-gray-500 mt-1"></div>
    </div>
  </div>
  <script>
  (function(){
    const input = document.getElementById('tagsInput');
    const list = document.getElementById('tagList');
    if (!input || !list) return;
    function parse(v){
      return String(v||'').split(',').map(s=>s.trim()).filter(Boolean);
    }
    function stringify(arr){ return arr.join(', '); }
    function addTag(label){
      const l = String(label||'').trim();
      if (l.length < 3) return;
      let items = parse(input.value);
      if (items.includes(l)) return;
      if (items.length >= 5) return;
      items.push(l);
      input.value = stringify(items);
    }
    list.addEventListener('click', (e)=>{
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const el = t.closest('.tag-chip');
      if (!el) return;
      const label = el.getAttribute('data-label');
      if (!label) return;
      addTag(label);
    });
  })();
  (function(){
    const form = document.getElementById('uploadForm');
    const fileEl = document.getElementById('fileInput');
    const bar = document.getElementById('prog');
    const status = document.getElementById('status');
    const tip = document.getElementById('progressTip');
    const tipClose = document.getElementById('tipClose');
    function showTip(){ if (tip) tip.classList.remove('hidden'); }
    function hideTip(){ if (tip) tip.classList.add('hidden'); }
    tipClose?.addEventListener('click', ()=> hideTip());
    function setProgress(r){ if (!bar) return; bar.style.width = Math.max(0, Math.min(100, r)) + '%'; }
    async function sha256(buf){ const d=await crypto.subtle.digest('SHA-256', buf); return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,'0')).join(''); }
    form?.addEventListener('submit', async (ev)=>{
      if (!fileEl?.files?.length) return; // regular submit fallback
      ev.preventDefault();
      const file = fileEl.files[0];
      const useMultipart = file.size > 10*1024*1024; // >10MiB
      try {
        showTip(); setProgress(0); status.textContent='準備中...';
        let key = '';
        if (useMultipart) {
          status.textContent = '初期化中...';
          const init = await fetch('/api/upload/multipart/init', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ filename: file.name, contentType: file.type||'application/octet-stream' }) });
          const { id, key: k, uploadId, partSizeBytes } = await init.json();
          key = k;
          const totalParts = Math.ceil(file.size / partSizeBytes);
          const etags = [];
          for (let i=0;i<totalParts;i++){
            const start = i*partSizeBytes; const end = Math.min(file.size, start+partSizeBytes);
            const blob = file.slice(start, end);
            status.textContent = 'アップロード中... (' + (i+1) + '/' + totalParts + ')';
            const partUrl = '/api/upload/multipart/part?key=' + encodeURIComponent(key) + '&uploadId=' + encodeURIComponent(uploadId) + '&partNumber=' + (i+1);
            const res = await fetch(partUrl, { method:'PUT', body: blob });
            const j = await res.json();
            etags.push({ partNumber: i+1, etag: j.etag });
            setProgress(((i+1)/totalParts)*80);
          }
          status.textContent = '確定中...';
          await fetch('/api/upload/multipart/complete', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ key, uploadId, parts: etags }) });
          setProgress(85);
        }
        status.textContent = '登録中...';
        const fd = new FormData(form);
        if (key) {
          fd.set('preuploadedKey', key);
          fd.set('filename', file.name);
          fd.set('sizeBytes', String(file.size));
          fd.set('contentType', file.type||'application/octet-stream');
          fd.delete('file');
        }
        const acceptJson = { headers: { 'accept':'application/json' }, method:'POST', body: fd };
        const resp = await fetch('/api/upload', acceptJson);
        const data = await resp.json().catch(()=>({}));
        if (!resp.ok || !data?.ok) { status.textContent = '登録失敗'; return; }
        setProgress(100); status.textContent = '完了';
        // ページ遷移なし。必要なら詳細へリンクを表示
        const a = document.createElement('a'); a.href = data.path; a.textContent = '詳細を開く'; a.className='text-blue-600 underline ml-2'; status.appendChild(a);
      } catch (err){ status.textContent = 'エラー: '+ (err?.message||err); }
    });
  })();
  </script>`;
  return html(layout('アップロード', body, { isLoggedIn: true, username: usernameForHeader, auth: { supaUrl: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY } }));
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '-';
  const units = ['B','KB','MB','GB','TB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return (Math.round(v * 10) / 10) + ' ' + units[i];
}

function formatDate(v: string | number | Date | null): string {
  if (!v) return '';
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    return `${y}-${m}-${day} ${hh}:${mm}`;
  } catch { return ''; }
}

function thumbnailUrl(it: any): string {
  const thumbKey = it.thumbnailKey || it.thumbnail_key || it.THUMBNAIL_KEY || null;
  const fileKey = it.fileKey || it.file_key || it.FILE_KEY || '';
  const key = thumbKey || fileKey;
  if (!key) return '/favicon.ico';
  // Workers経由でR2から取得
  const u = new URL('/api/thumbnail', 'https://dummy');
  u.searchParams.set('k', key);
  // remove origin placeholder
  return u.pathname + '?' + u.searchParams.toString();
}

async function placeholderPng(): Promise<Response> {
  // 1x1透明PNG
  const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
  const buf = Uint8Array.from(atob(base64), c=>c.charCodeAt(0));
  return new Response(buf, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } });
}

function fileUrl(it: any): string {
  const fileKey = it.fileKey || it.file_key || it.FILE_KEY || '';
  if (!fileKey) return thumbnailUrl(it);
  const u = new URL('/api/file', 'https://dummy');
  u.searchParams.set('k', fileKey);
  return u.pathname + '?' + u.searchParams.toString();
}

async function ensureTables(env: Env): Promise<void> {
  // enforce FK each call (D1は接続ごと)
  try { await env.DB.prepare(`PRAGMA foreign_keys=ON;`).run(); } catch {}
  // items
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS items (
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
    )`).run();
  // users
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      displayName TEXT,
      avatarUrl TEXT,
      createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`).run();
  // tags
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      created_at TEXT
    )`).run();
  // item_tags
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS item_tags (
      itemId TEXT NOT NULL,
      tagId TEXT NOT NULL,
      UNIQUE(itemId, tagId)
    )`).run();

  // reports
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      itemId TEXT NOT NULL,
      reporterUserId TEXT NOT NULL,
      reason TEXT,
      createdAt TEXT NOT NULL,
      status TEXT NOT NULL
    )`).run();

  // migrate existing 'items' to ensure required columns exist
  try {
    const res: any = await env.DB.prepare(`PRAGMA table_info(items)`).all();
    const rows: any[] = res?.results ?? res ?? [];
    const colNames = new Set<string>(rows.map((r: any) => String(r.name ?? r.NAME ?? '').toLowerCase()));
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
      { name: 'downloadCount', type: 'INTEGER' },
      { name: 'file_key', type: 'TEXT' },
      { name: 'thumbnail_key', type: 'TEXT' },
      { name: 'published_at', type: 'TEXT' },
      { name: 'created_at', type: 'TEXT' },
      { name: 'updated_at', type: 'TEXT' },
    ];
    for (const w of want) {
      if (!colNames.has(w.name)) {
        await env.DB.prepare(`ALTER TABLE items ADD COLUMN ${w.name} ${w.type}`).run();
      }
    }
    // indexes (存在列のみ安全に作成)
    const has = (n: string) => colNames.has(n.toLowerCase());
    // items (visibility, published_at)
    if (has('visibility') && has('published_at')) {
      try { await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_items_visibility_publishedAt ON items (visibility, published_at DESC)`).run(); } catch {}
    }
    // items (category, published_at)
    if (has('category') && has('published_at')) {
      try { await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_items_category_publishedAt ON items (category, published_at DESC)`).run(); } catch {}
    }
    // items (downloadCount) — 列が存在する場合のみ
    if (has('downloadCount')) {
      try { await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_items_downloadCount ON items (downloadCount DESC)`).run(); } catch {}
    }
  } catch {}

  // item_tags index
  try { await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_item_tags_tag_item ON item_tags (tagId, itemId)`).run(); } catch {}
}

async function buildDetailedErrorHtml(e: any, env: Env, diag: any): Promise<string> {
  const parts: string[] = [];
  const esc = (s: any) => escapeHtml(String(s ?? ''));
  parts.push('<h1 class="text-lg font-semibold">エラー</h1>');
  parts.push('<div class="mt-2 text-sm">');
  parts.push(`<div class="text-red-600">${esc(e?.name || 'Error')}: ${esc(e?.message || e)}</div>`);
  if (e?.stack) parts.push(`<pre class="text-xs text-gray-600 whitespace-pre-wrap">${esc(e.stack)}</pre>`);
  parts.push('</div>');
  // diag
  try {
    parts.push('<h2 class="mt-4 font-semibold">診断情報</h2>');
    parts.push('<div class="text-xs">');
    parts.push(`<div><b>id</b>: ${esc(diag?.id)}</div>`);
    parts.push(`<div><b>mainKey</b>: ${esc(diag?.mainKey)}</div>`);
    parts.push(`<div><b>thumbKey</b>: ${esc(diag?.thumbKey)}</div>`);
    if (Array.isArray(diag?.insertCols) && Array.isArray(diag?.insertValsPreview)) {
      parts.push('<div class="mt-2"><b>insert columns</b></div>');
      parts.push(`<pre class="whitespace-pre-wrap">${esc(JSON.stringify(diag.insertCols))}</pre>`);
      parts.push('<div><b>insert values (preview)</b></div>');
      parts.push(`<pre class="whitespace-pre-wrap">${esc(JSON.stringify(diag.insertValsPreview))}</pre>`);
    }
    if (Array.isArray(diag?.tags)) {
      parts.push('<div class="mt-2"><b>tags</b></div>');
      parts.push(`<pre class="whitespace-pre-wrap">${esc(JSON.stringify(diag.tags))}</pre>`);
    }
    parts.push('</div>');
  } catch {}
  // 外部キー診断
  try {
    const fk = await env.DB.prepare(`PRAGMA foreign_key_list(item_tags)`).all();
    const fkRows: any[] = fk?.results ?? fk ?? [];
    parts.push('<h2 class="mt-4 font-semibold">外部キー</h2>');
    parts.push(`<pre class="text-xs whitespace-pre-wrap">${esc(JSON.stringify(fkRows))}</pre>`);
  } catch {}
  return parts.join('\n');
}

function slugify(s: string): string {
  return String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'tag';
}

function parseTags(input: string): string[] {
  if (!input) return [];
  const arr = input.split(',').map(s=>s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of arr) {
    const norm = t.slice(0,20);
    if (norm.length < 3) continue;
    if (!seen.has(norm)) { seen.add(norm); out.push(norm); }
    if (out.length >= 5) break;
  }
  return out;
}

function extractExt(name: string): string {
  const base = String(name || '').split(/[\\\/]/).pop() || '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  const ext = base.slice(dot + 1).toLowerCase();
  if (!/^[a-z0-9]{1,8}$/.test(ext)) return '';
  return '.' + ext;
}

function isAllowedByConfig(extNoDot: string, contentType: string, env: Env): boolean {
  try {
    const allowed = String(env.ALLOWED_FILE_TYPES || '').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
    if (!allowed.length) return true;
    const ext = extNoDot?.toLowerCase() || '';
    if (ext && allowed.includes(ext)) return true;
    const inferred = inferExtFromContentType(contentType);
    if (inferred && allowed.includes(inferred)) return true;
    // jpeg vs jpg normalize
    if (ext === 'jpeg' && allowed.includes('jpg')) return true;
    if (ext === 'jpg' && allowed.includes('jpeg')) return true;
    return false;
  } catch { return true; }
}

function inferExtFromContentType(ct: string): string {
  const t = String(ct || '').toLowerCase();
  if (t === 'image/png') return 'png';
  if (t === 'image/jpeg') return 'jpg';
  if (t === 'image/webp') return 'webp';
  if (t === 'video/mp4') return 'mp4';
  if (t === 'video/webm') return 'webm';
  if (t === 'audio/mpeg' || t === 'audio/mp3') return 'mp3';
  if (t === 'audio/wav' || t === 'audio/x-wav') return 'wav';
  if (t === 'model/gltf-binary') return 'glb';
  if (t === 'model/gltf+json') return 'gltf';
  if (t === 'model/obj') return 'obj';
  if (t === 'text/plain') return '';
  if (t === 'model/obj' || t === 'text/plain') return 'obj';
  return '';
}
