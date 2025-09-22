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
  R2_BUCKET: string;
  R2: R2Bucket;
  DB: D1Database;
  ASSETS: Fetcher;
}

const html = (s: string, status = 200) => new Response(s, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
function layout(title: string, body: string): string {
  return `<!doctype html><html lang="ja"><head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <link rel="stylesheet" href="/app.css" />
  </head><body>
    <header class="border-b border-gray-200 h-14 flex items-center">
      <div class="max-w-[980px] mx-auto px-4 w-full flex justify-between">
        <a href="/" class="font-semibold text-gray-900">AI Uploader</a>
        <nav class="flex gap-3">
          <a href="/items" class="text-blue-600">一覧</a>
          <a href="/upload" class="text-blue-600">アップロード</a>
        </nav>
      </div>
    </header>
    <main class="max-w-[980px] mx-auto px-4 py-4">${body}</main>
    <footer class="border-t border-gray-200">
      <div class="max-w-[980px] mx-auto px-4 py-3 text-xs text-gray-500">© ${new Date().getFullYear()} AI Uploader</div>
    </footer>
  </body></html>`;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/api/thumbnail' && req.method === 'GET') {
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

    // minimal API placeholder
    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
    }

    // server-rendered minimal pages
    if (req.method === 'GET') {
      if (url.pathname === '/' || url.pathname === '/items') return renderItems(env, url);
      const m = /^\/items\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
      if (m) return renderItem(env, m[1]);
      if (url.pathname === '/upload') return renderUpload(env);
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
    return new Response(JSON.stringify({ allowed: true }), {
      headers: { 'content-type': 'application/json' },
    });
  }
}

async function renderItems(env: Env, url: URL): Promise<Response> {
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
  const pageSize = 20;
  let items: any[] = [];
  let hasNext = false;
  try {
    const limit = pageSize + 1;
    const offset = (page - 1) * pageSize;
    const stmt = env.DB.prepare(
      `SELECT *
       FROM items
       WHERE visibility = 'public'
       ORDER BY rowid DESC
       LIMIT ? OFFSET ?`
    ).bind(limit, offset);
    const res: any = await stmt.all();
    const rows: any[] = res?.results ?? res ?? [];
    hasNext = rows.length > pageSize;
    items = rows.slice(0, pageSize).map((r: any) => ({
      id: r.id ?? r.ID,
      title: r.title ?? r.TITLE ?? 'Untitled',
      category: r.category ?? r.CATEGORY ?? 'OTHER',
      visibility: r.visibility ?? r.VISIBILITY ?? 'public',
      originalFilename: r.original_filename ?? r.originalFilename ?? r.ORIGINAL_FILENAME ?? '',
      sizeBytes: Number(r.size_bytes ?? r.sizeBytes ?? r.SIZE_BYTES ?? 0),
      fileKey: r.file_key ?? r.fileKey ?? r.FILE_KEY ?? '',
      createdAt: r.created_at ?? r.createdAt ?? r.CREATED_AT ?? null,
    }));
  } catch (e: any) {
    const body = `<h1 class="text-lg font-semibold">一覧</h1>
    <p class="text-gray-500 text-sm">データ取得に失敗しました。テーブル未作成の可能性があります。</p>
    <pre class="text-gray-500 text-xs whitespace-pre-wrap">${escapeHtml(String(e?.message || e))}</pre>`;
    return html(layout('一覧', body));
  }

  const cards = items.map((it) => `
    <div class="border border-gray-200 rounded-lg p-3 bg-white">
      <div class="bg-gray-100 rounded-md overflow-hidden mb-2">
        <img class="w-full h-auto block" src="${thumbnailUrl(it)}" alt="thumb" loading="lazy" />
      </div>
      <div class="flex justify-between items-center gap-2">
        <div class="font-semibold">${escapeHtml(it.title)}</div>
        <a class="inline-block px-3 py-1.5 border border-black rounded-md text-black hover:bg-black/5" href="/items/${escapeHtml(it.id)}">詳細</a>
      </div>
      <div class="flex gap-2 text-gray-500 text-xs mt-1.5">
        <span>${escapeHtml(it.category)}</span>
        <span>・</span>
        <span>${formatBytes(it.sizeBytes)}</span>
      </div>
      <div class="text-gray-500 text-xs mt-1.5">${escapeHtml(it.originalFilename || '')}</div>
      <div class="text-gray-500 text-xs mt-1.5">${formatDate(it.createdAt)}</div>
    </div>
  `).join('');

  const pager = `<div class="flex gap-2 mt-4">
    ${page > 1 ? `<a class=\"border border-gray-200 rounded-md px-3 py-1.5\" href="/items?page=${page - 1}">前へ</a>` : ''}
    ${hasNext ? `<a class=\"border border-gray-200 rounded-md px-3 py-1.5\" href="/items?page=${page + 1}">次へ</a>` : ''}
  </div>`;

  const body = `<h1 class="text-lg font-semibold">一覧</h1>
    <div class="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))] mt-3">${cards || '<div class="text-gray-500 text-sm">アイテムがありません</div>'}</div>
    ${pager}`;
  return html(layout('一覧', body));
}

async function renderItem(env: Env, id: string): Promise<Response> {
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

  const it = {
    id: row.id ?? row.ID,
    title: row.title ?? row.TITLE ?? 'Untitled',
    description: row.description ?? row.DESCRIPTION ?? '',
    category: row.category ?? row.CATEGORY ?? 'OTHER',
    visibility: row.visibility ?? row.VISIBILITY ?? 'public',
    originalFilename: row.original_filename ?? row.originalFilename ?? row.ORIGINAL_FILENAME ?? '',
    sizeBytes: Number(row.size_bytes ?? row.sizeBytes ?? row.SIZE_BYTES ?? 0),
    fileKey: row.file_key ?? row.fileKey ?? row.FILE_KEY ?? '',
    thumbnailKey: row.thumbnail_key ?? row.thumbnailKey ?? row.THUMBNAIL_KEY ?? '',
    createdAt: row.created_at ?? row.CREATED_AT ?? row.createdAt ?? null,
  };

  // 2) UI
  const meta = `
  <div class="meta">
    <span>${escapeHtml(it.category)}</span>
    <span>・</span>
    <span>${formatBytes(it.sizeBytes)}</span>
    <span>・</span>
    <span>${formatDate(it.createdAt)}</span>
  </div>`;

  const actions = `
  <div class="flex gap-2 flex-wrap mt-2.5">
    <a class="inline-block px-3 py-1.5 border border-black rounded-md text-black hover:bg-black/5" href="/api/thumbnail?k=${encodeURIComponent(it.fileKey)}" target="_blank">原寸プレビュー</a>
    <button class="inline-block px-3 py-1.5 border border-black rounded-md text-black hover:bg-black/5" id="btnCopy">URLをコピー</button>
    <button class="inline-block px-3 py-1.5 border border-black rounded-md text-black hover:bg-black/5" id="btnDownload">ダウンロードURL発行</button>
  </div>`;

  const desc = it.description ? `<p style="margin-top:12px;white-space:pre-wrap">${escapeHtml(it.description)}</p>` : '';

  const body = `
  <div class="flex items-start gap-4">
    <div class="flex-1">
      <div class="bg-gray-100 rounded-md overflow-hidden mb-2">
        <img class="w-full h-auto block" src="${thumbnailUrl(it)}" alt="thumb" loading="lazy" />
      </div>
    </div>
    <div class="flex-1 min-w-[280px]">
      <h1 class="text-lg font-semibold">${escapeHtml(it.title)}</h1>
      ${meta}
      <div class="text-gray-500 text-xs mt-1.5">${escapeHtml(it.originalFilename || '')}</div>
      ${actions}
      ${desc}
    </div>
  </div>
  <script>
  (function(){
    const btnCopy=document.getElementById('btnCopy');
    btnCopy?.addEventListener('click',async()=>{
      try{ await navigator.clipboard.writeText(location.href); btnCopy.textContent='コピーしました'; setTimeout(()=>btnCopy.textContent='URLをコピー',1500);}catch{}
    });
    const btnDl=document.getElementById('btnDownload');
    btnDl?.addEventListener('click',async()=>{
      try{
        const res=await fetch('/api/items/${escapeHtml(it.id)}/download-url',{method:'POST'});
        const data=await res.json();
        if(!res.ok||!data.url){ alert('発行失敗'); return; }
        window.location.href=data.url;
      }catch{ alert('発行失敗'); }
    });
  })();
  </script>
  `;
  return html(layout(it.title || '詳細', body));
}

function renderUpload(env: Env): Response {
  const body = `<h1 style="font-size:20px;font-weight:700">アップロード</h1><p>最小構成（実装これから）。</p>`;
  return html(layout('アップロード', body));
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
