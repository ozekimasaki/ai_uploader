import type { Env, ItemRow } from '../env';
import { CATEGORY_LABELS } from '../env';
import { getAuthUser } from '../lib/auth';
import { ensureTables, fetchItem, getUsernameById, loadTagsForItem } from '../lib/db';
import { html } from '../lib/http';
import { dedupeCheck } from '../lib/rate-limit';
import { escapeHtml, formatBytes, formatDate, jsonForHtml } from '../lib/util';
import { fileUrl, thumbnailUrl } from './items';
import { layout, notFoundPage } from './layout';

function mediaMarkup(it: ItemRow): string {
  const cat = String(it.category || '').toUpperCase();
  const fileSrc = fileUrl(it);
  const thumb = thumbnailUrl(it);
  if (cat === 'IMAGE') {
    return `<div class="well overflow-hidden"><img class="w-full h-auto block" src="${fileSrc}" alt="${escapeHtml(it.title)}" loading="lazy" /></div>`;
  }
  if (cat === 'VIDEO') {
    const poster = it.thumbnailKey ? ` poster="${thumb}"` : '';
    return `<div class="well overflow-hidden"><video class="w-full h-auto" controls playsinline preload="metadata"${poster}><source src="${fileSrc}" type="${escapeHtml(it.contentType || 'video/mp4')}" /></video></div>`;
  }
  if (cat === 'MUSIC' || cat === 'VOICE') {
    const img = it.thumbnailKey ? `<img class="w-16 h-16 object-cover rounded-md" src="${thumb}" alt="thumb" />` : '';
    return `<div class="well p-4 flex items-center gap-3">${img}<audio controls preload="metadata" class="w-full"><source src="${fileSrc}" type="${escapeHtml(it.contentType || 'audio/mpeg')}" /></audio></div>`;
  }
  return `<div class="well overflow-hidden"><img class="w-full h-auto block" src="${thumb}" alt="preview" loading="lazy" /></div>`;
}

function metaRow(label: string, value: string): string {
  return `<div class="meta-label">${escapeHtml(label)}</div><div class="text-sm">${value}</div>`;
}

export async function renderItem(env: Env, id: string, req: Request, ctx?: ExecutionContext): Promise<Response> {
  let viewerId = '';
  let usernameForHeader = '';
  try {
    const authed = await getAuthUser(req, env).catch(() => null);
    viewerId = String(authed?.id || '');
    if (viewerId) usernameForHeader = await getUsernameById(env, viewerId).catch(() => '');
  } catch {}

  await ensureTables(env).catch(() => {});
  const it = await fetchItem(env, id).catch(() => null);
  if (!it) return notFoundPage(env, 'アイテムが存在しないか、非公開です。', { isLoggedIn: !!viewerId, username: usernameForHeader });

  // 非公開アイテムは所有者のみ閲覧可
  if (String(it.visibility).toLowerCase() === 'private' && (!viewerId || viewerId !== it.ownerUserId)) {
    return notFoundPage(env, 'アイテムが存在しないか、非公開です。', { isLoggedIn: !!viewerId, username: usernameForHeader });
  }

  // 閲覧カウント（同一IP×同一アイテムで1時間に1回まで。レスポンスを遅延させない）
  const countView = async () => {
    try {
      const ip = req.headers.get('cf-connecting-ip') || '0.0.0.0';
      const ok = await dedupeCheck(`view:${it.id}:${ip}`, 3600, env);
      if (ok) {
        await env.DB.prepare('UPDATE items SET viewCount = COALESCE(viewCount, 0) + 1 WHERE id = ?').bind(it.id).run();
      }
    } catch {}
  };
  if (ctx) ctx.waitUntil(countView());
  else await countView();

  const tags = await loadTagsForItem(env, it.id).catch(() => [] as string[]);
  const ownerUsername = it.ownerUserId ? await getUsernameById(env, it.ownerUserId).catch(() => '') : '';

  const isOwner = !!viewerId && viewerId === it.ownerUserId;
  const vis = String(it.visibility || '').toLowerCase() === 'public' ? 'public' : 'private';
  const visBadge =
    vis === 'public'
      ? `<span class="badge badge-info"><i class="fa-solid fa-globe"></i> 公開</span>`
      : `<span class="badge badge-warn"><i class="fa-solid fa-lock"></i> 非公開</span>`;

  const meta = `
  <div class="card p-4 mt-4 grid [grid-template-columns:88px_1fr] gap-x-3 gap-y-2">
    ${ownerUsername ? metaRow('投稿者', `<a class="link" href="/u/${escapeHtml(ownerUsername)}">@${escapeHtml(ownerUsername)}</a>`) : ''}
    ${metaRow('カテゴリ', escapeHtml((CATEGORY_LABELS as Record<string, string>)[String(it.category).toUpperCase()] ?? it.category))}
    ${metaRow('サイズ', formatBytes(it.sizeBytes))}
    ${metaRow('作成日', formatDate(it.createdAt))}
    ${metaRow('ファイル名', escapeHtml(it.originalFilename || '-'))}
    ${metaRow('ダウンロード', `${Number(it.downloadCount || 0)} 回`)}
    ${metaRow('閲覧', `${Number(it.viewCount || 0)} 回`)}
  </div>`;

  const ownerControls = isOwner
    ? `
    <button id="btnToggleVis" class="btn">${vis === 'public' ? '<i class="fa-solid fa-lock"></i> 非公開にする' : '<i class="fa-solid fa-globe"></i> 公開する'}</button>
    <button id="btnDelete" class="btn btn-danger"><i class="fa-solid fa-trash"></i> 削除</button>`
    : '';

  const actions = `
  <div class="flex gap-2 flex-wrap mt-4 items-center">
    <button id="btnDl" class="btn btn-primary"><i class="fa-solid fa-download"></i> ダウンロード</button>
    ${ownerControls}
    <button id="btnReport" class="btn btn-warn"><i class="fa-solid fa-flag"></i> 通報</button>
  </div>`;

  const desc = it.description
    ? `<div class="card p-4 mt-4"><div class="meta-label mb-1">説明</div><p class="text-sm whitespace-pre-wrap">${escapeHtml(it.description)}</p></div>`
    : '';
  const share = `
      <div class="meta-label mb-1">共有</div>
      <div class="flex items-center gap-2">
        <a id="btnShareX" class="btn btn-sm" target="_blank" rel="noreferrer" href="#" title="Xでシェア"><i class="fa-brands fa-x-twitter"></i></a>
        <a id="btnShareLine" class="btn btn-sm" target="_blank" rel="noreferrer" href="#" title="LINEでシェア"><i class="fa-brands fa-line"></i></a>
        <a id="btnShareFb" class="btn btn-sm" target="_blank" rel="noreferrer" href="#" title="Facebookでシェア"><i class="fa-brands fa-facebook"></i></a>
        <button id="btnCopyUrl" class="btn btn-sm" title="クリックでコピー"><i class="fa-solid fa-link"></i></button>
      </div>`;
  const prm = it.prompt
    ? `<div class="card p-4 mt-4"><div class="flex items-center justify-between mb-1"><div class="meta-label">Prompt</div><button id="btnCopyPrompt" class="btn btn-sm"><i class="fa-regular fa-copy"></i> コピー</button></div><pre id="promptText" class="well p-3 text-sm whitespace-pre-wrap font-mono">${escapeHtml(it.prompt)}</pre><div class="mt-4">${share}</div></div>`
    : `<div class="card p-4 mt-4">${share}</div>`;

  const pageData = {
    itemId: it.id,
    fileKey: it.fileKey,
    fallbackName: it.originalFilename || it.title || 'download',
    isOwner,
    visibility: vis,
  };

  const body = `
  <div class="mb-4"><a class="link text-sm" href="/items"><i class="fa-solid fa-arrow-left"></i> 一覧へ</a></div>
  <div class="grid gap-5 md:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]">
    <div>${mediaMarkup(it)}</div>
    <div>
      <div class="flex items-start justify-between gap-2">
        <h1 class="page-title">${escapeHtml(it.title)}</h1>
        ${visBadge}
      </div>
      ${tags.length ? `<div class="mt-2 flex flex-wrap gap-1">${tags.map((t) => `<a href="/items?tag=${encodeURIComponent(t)}" class="badge">#${escapeHtml(t)}</a>`).join('')}</div>` : ''}
      ${actions}
      ${meta}
      ${desc}
      ${prm}
    </div>
  </div>
  <script type="application/json" id="page-data">${jsonForHtml(pageData)}</script>
  <script type="module" src="/item-detail.js"></script>`;
  return html(layout(it.title || '詳細', body, { isLoggedIn: true, username: usernameForHeader }), 200, env);
}
