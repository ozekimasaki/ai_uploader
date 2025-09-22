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

    // multipart upload endpoints for large files
    if (url.pathname === '/api/upload/multipart/init' && req.method === 'POST') {
      try {
        const body = await req.json().catch(() => ({}));
        const filename = String(body?.filename || '').trim();
        const contentType = String(body?.contentType || 'application/octet-stream');
        if (!filename) return new Response(JSON.stringify({ error: 'bad_request', message: 'filename required' }), { status: 400, headers: { 'content-type': 'application/json' } });
        const id = crypto.randomUUID();
        const ext = extractExt(filename);
        const key = `items/${id}/source${ext}`;
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
        const body = await req.json().catch(() => ({}));
        const key = String(body?.key || '');
        const uploadId = String(body?.uploadId || '');
        const partsIn = Array.isArray(body?.parts) ? body.parts : [];
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
        const body = await req.json().catch(() => ({}));
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
        await ensureTables(env);
        const form = await req.formData();
        const preuploadedKey = String(form.get('preuploadedKey') || '').trim();
        const file = form.get('file');
        if (!preuploadedKey && (!(file instanceof File) || (file as File).size === 0)) return html(layout('エラー', `<h1 class=\"text-lg font-semibold\">エラー</h1><p class=\"text-sm text-red-600\">ファイルは必須です。</p>`), 400);

        const title = String(form.get('title') || '').trim();
        const category = String(form.get('category') || '').trim().toUpperCase();
        const visibility = (String(form.get('visibility') || 'private').trim().toLowerCase() === 'public') ? 'public' : 'private';
        const description = String(form.get('description') || '').trim();
        const prompt = String(form.get('prompt') || '').trim();
        const tagsInput = String(form.get('tags') || '').trim();
        const thumbnail = form.get('thumbnail');

        if (!title) return html(layout('エラー', `<h1 class="text-lg font-semibold">エラー</h1><p class="text-sm text-red-600">タイトルは必須です。</p>`), 400);
        const allowedCats = ['IMAGE','VIDEO','MUSIC','VOICE','3D','OTHER'];
        if (!allowedCats.includes(category)) return html(layout('エラー', `<h1 class=\"text-lg font-semibold\">エラー</h1><p class=\"text-sm text-red-600\">カテゴリーが不正です。</p>`), 400);

        const maxMb = Number(env.MAX_FILE_SIZE_MB || 2048);
        if (Number.isFinite(maxMb)) {
          const mb = preuploadedKey ? Number(form.get('sizeBytes') || 0) / (1024*1024) : (file as File).size / (1024*1024);
          if (mb > maxMb) return html(layout('エラー', `<h1 class=\"text-lg font-semibold\">エラー</h1><p class=\"text-sm text-red-600\">ファイルサイズが上限(${maxMb}MB)を超えています。</p>`), 400);
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
          await env.R2.put(mainKey, f.stream(), { httpMetadata: { contentType } });
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

        // 所有者ID（認証未実装のため暫定値。後でSupabase連携に置換）
        const ownerUserId = 'anonymous';
        // Ensure FK user exists
        try {
          await env.DB.prepare(`INSERT OR IGNORE INTO users (id, username, displayName) VALUES (?, ?, ?)`)
            .bind(ownerUserId, ownerUserId, 'Anonymous').run();
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
        return html(layout('エラー', details), 500);
      }
    }

    if (url.pathname === '/api/file' && req.method === 'GET') {
      const key = url.searchParams.get('k');
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
        return new Response(obj.body, { headers });
      } catch {
        return new Response('error', { status: 500 });
      }
    }

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
      ownerUserId: r.ownerUserId ?? r.OWNERUSERID ?? r.owner_user_id ?? r.OWNER_USER_ID ?? '',
      title: r.title ?? r.TITLE ?? 'Untitled',
      category: r.category ?? r.CATEGORY ?? 'OTHER',
      visibility: r.visibility ?? r.VISIBILITY ?? 'public',
      originalFilename: r.original_filename ?? r.originalFilename ?? r.ORIGINAL_FILENAME ?? '',
      sizeBytes: Number(r.size_bytes ?? r.sizeBytes ?? r.SIZE_BYTES ?? 0),
      fileKey: r.file_key ?? r.fileKey ?? r.FILE_KEY ?? '',
      thumbnailKey: r.thumbnail_key ?? r.thumbnailKey ?? r.THUMBNAIL_KEY ?? '',
      createdAt: r.created_at ?? r.createdAt ?? r.CREATED_AT ?? null,
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
    return html(layout('一覧', body));
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
      ${it.tags && it.tags.length ? `<div class=\"mt-1.5 flex flex-wrap gap-1\">${it.tags.map((tg: any) => `<span class=\"text-xs px-2 py-0.5 rounded-full border border-gray-200\">#${escapeHtml(String(tg))}</span>`).join('')}</div>` : ''}
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
    </div>
  </div>`;

  const actions = `
  <div class="flex gap-2 flex-wrap mt-2.5">
    <a class="inline-block px-3 py-1.5 border border-black rounded-md text-black hover:bg-black/5" href="/api/file?k=${encodeURIComponent(it.fileKey)}" target="_blank">原寸プレビュー</a>
    <button class="inline-block px-3 py-1.5 border border-black rounded-md text-black hover:bg-black/5" id="btnCopy">URLをコピー</button>
    <a class="inline-block px-3 py-1.5 border border-black rounded-md text-black hover:bg-black/5" href="/api/file?k=${encodeURIComponent(it.fileKey)}&download=1&name=${encodeURIComponent(it.originalFilename || it.title || 'download')}">ダウンロード</a>
  </div>`;

  const desc = it.description ? `<div class="mt-4"><div class=\"text-gray-500 text-xs mb-1\">説明</div><p class="whitespace-pre-wrap">${escapeHtml(it.description)}</p></div>` : '';
  const prm = it.prompt ? `<div class="mt-4"><div class=\"text-gray-500 text-xs mb-1\">Prompt</div><p class="whitespace-pre-wrap">${escapeHtml(it.prompt)}</p></div>` : '';

  const body = `
  <div class="flex items-start gap-4">
    <div class="flex-1">
      <div class="bg-gray-100 rounded-md overflow-hidden mb-2">
        <img class="w-full h-auto block" src="${fileUrl(it)}" alt="thumb" loading="lazy" />
      </div>
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
    const btnCopy=document.getElementById('btnCopy');
    btnCopy?.addEventListener('click',async()=>{
      try{ await navigator.clipboard.writeText(location.href); btnCopy.textContent='コピーしました'; setTimeout(()=>btnCopy.textContent='URLをコピー',1500);}catch{}
    });
  })();
  </script>
  `;
  return html(layout(it.title || '詳細', body));
}

async function renderUpload(env: Env): Promise<Response> {
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

function fileUrl(it: any): string {
  const fileKey = it.fileKey || it.file_key || it.FILE_KEY || '';
  if (!fileKey) return thumbnailUrl(it);
  const u = new URL('/api/file', 'https://dummy');
  u.searchParams.set('k', fileKey);
  return u.pathname + '?' + u.searchParams.toString();
}

async function ensureTables(env: Env): Promise<void> {
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
      created_at TEXT,
      updated_at TEXT
    )`).run();
  // users
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
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
      { name: 'file_key', type: 'TEXT' },
      { name: 'thumbnail_key', type: 'TEXT' },
      { name: 'created_at', type: 'TEXT' },
      { name: 'updated_at', type: 'TEXT' },
    ];
    for (const w of want) {
      if (!colNames.has(w.name)) {
        await env.DB.prepare(`ALTER TABLE items ADD COLUMN ${w.name} ${w.type}`).run();
      }
    }
  } catch {}
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
