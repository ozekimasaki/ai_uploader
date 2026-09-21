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
    return `<div class="bg-gray-100 rounded-md overflow-hidden mb-2"><img class="w-full h-auto block" src="${fileSrc}" alt="${escapeHtml(it.title)}" loading="lazy" /></div>`;
  }
  if (cat === 'VIDEO') {
    const poster = it.thumbnailKey ? ` poster="${thumb}"` : '';
    return `<div class="bg-gray-100 rounded-md overflow-hidden mb-2"><video class="w-full h-auto" controls playsinline preload="metadata"${poster}><source src="${fileSrc}" type="${escapeHtml(it.contentType || 'video/mp4')}" /></video></div>`;
  }
  if (cat === 'MUSIC' || cat === 'VOICE') {
    const img = it.thumbnailKey ? `<img class="w-16 h-16 object-cover rounded" src="${thumb}" alt="thumb" />` : '';
    return `<div class="bg-gray-50 rounded-md p-3 mb-2 flex items-center gap-3">${img}<audio controls preload="metadata" class="w-full"><source src="${fileSrc}" type="${escapeHtml(it.contentType || 'audio/mpeg')}" /></audio></div>`;
  }
  return `<div class="bg-gray-100 rounded-md overflow-hidden mb-2"><img class="w-full h-auto block" src="${thumb}" alt="preview" loading="lazy" /></div>`;
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

  const meta = `
  <div class="mt-2 text-sm">
    <div class="grid [grid-template-columns:100px_1fr] gap-x-3 gap-y-1">
      ${ownerUsername ? `<div class="text-gray-500 text-xs">投稿者</div><div><a class="text-blue-600" href="/u/${escapeHtml(ownerUsername)}">@${escapeHtml(ownerUsername)}</a></div>` : ''}
      <div class="text-gray-500 text-xs">カテゴリ</div><div>${escapeHtml((CATEGORY_LABELS as Record<string, string>)[String(it.category).toUpperCase()] ?? it.category)}</div>
      <div class="text-gray-500 text-xs">タグ</div><div>${tags.length ? tags.map((t) => `<a href="/items?tag=${encodeURIComponent(t)}" class="inline-block text-xs px-2 py-0.5 rounded-full border border-gray-200 mr-1 mb-1 hover:bg-black/5">#${escapeHtml(t)}</a>`).join('') : '-'}</div>
      <div class="text-gray-500 text-xs">サイズ</div><div>${formatBytes(it.sizeBytes)}</div>
      <div class="text-gray-500 text-xs">作成日</div><div>${formatDate(it.createdAt)}</div>
      <div class="text-gray-500 text-xs">ファイル名</div><div>${escapeHtml(it.originalFilename || '')}</div>
      <div class="text-gray-500 text-xs">ダウンロード</div><div>${Number(it.downloadCount || 0)}</div>
      <div class="text-gray-500 text-xs">閲覧</div><div>${Number(it.viewCount || 0)}</div>
    </div>
  </div>`;

  const isOwner = !!viewerId && viewerId === it.ownerUserId;
  const vis = String(it.visibility || '').toLowerCase() === 'public' ? 'public' : 'private';
  const ownerControls = isOwner
    ? `
    <button id="btnToggleVis" class="inline-block px-3 py-1.5 border border-gray-700 rounded-md text-gray-800 hover:bg-black/5">${vis === 'public' ? '非公開にする' : '公開する'}</button>
    <span class="text-xs text-gray-500 ml-1">現在: ${vis === 'public' ? '公開' : '非公開'}</span>
    <button id="btnDelete" class="inline-block px-3 py-1.5 border border-red-600 text-red-700 rounded-md hover:bg-red-50">削除</button>`
    : '';

  const actions = `
  <div class="flex gap-2 flex-wrap mt-2.5 items-center">
    <button id="btnDl" class="inline-block px-3 py-1.5 border border-black rounded-md text-black hover:bg-black/5">ダウンロード</button>
    ${ownerControls}
    <button id="btnReport" class="inline-block px-3 py-1.5 border border-amber-600 text-amber-700 rounded-md hover:bg-amber-50">通報</button>
  </div>`;

  const desc = it.description ? `<div class="mt-4"><div class="text-gray-500 text-xs mb-1">説明</div><p class="whitespace-pre-wrap">${escapeHtml(it.description)}</p></div>` : '';
  const share = `
    <div class="mt-3">
      <div class="text-gray-500 text-xs mb-1">共有</div>
      <div class="flex items-center gap-2">
        <a id="btnShareX" class="inline-flex items-center justify-center w-9 h-9 rounded-md border border-gray-300 text-gray-700 hover:bg-black/5" target="_blank" rel="noreferrer" href="#" title="Xでシェア"><i class="fa-brands fa-x-twitter"></i></a>
        <a id="btnShareLine" class="inline-flex items-center justify-center w-9 h-9 rounded-md border border-gray-300 text-gray-700 hover:bg-black/5" target="_blank" rel="noreferrer" href="#" title="LINEでシェア"><i class="fa-brands fa-line"></i></a>
        <a id="btnShareFb" class="inline-flex items-center justify-center w-9 h-9 rounded-md border border-gray-300 text-gray-700 hover:bg-black/5" target="_blank" rel="noreferrer" href="#" title="Facebookでシェア"><i class="fa-brands fa-facebook"></i></a>
        <button id="btnCopyUrl" class="group relative inline-flex items-center justify-center w-9 h-9 rounded-md border border-black text-black hover:bg-black/5" title="クリックでコピー"><i class="fa-solid fa-link"></i><span class="pointer-events-none absolute -top-7 opacity-0 group-hover:opacity-100 transition bg-black text-white text-[10px] rounded px-2 py-0.5">コピー</span></button>
      </div>
    </div>`;
  const prm = it.prompt
    ? `<div class="mt-4"><div class="flex items-center justify-between"><div class="text-gray-500 text-xs mb-1">Prompt</div><button id="btnCopyPrompt" class="inline-block px-2 py-1 text-xs border border-black rounded-md text-black hover:bg-black/5">コピー</button></div><pre id="promptText" class="whitespace-pre-wrap text-sm">${escapeHtml(it.prompt)}</pre>${share}</div>`
    : `<div class="mt-4">${share}</div>`;

  const pageData = {
    itemId: it.id,
    fileKey: it.fileKey,
    fallbackName: it.originalFilename || it.title || 'download',
    isOwner,
    visibility: vis,
  };

  const body = `
  <div class="flex items-start gap-4 flex-wrap">
    <div class="flex-1 min-w-[280px]">
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
  <script type="application/json" id="page-data">${jsonForHtml(pageData)}</script>
  <script type="module" src="/item-detail.js"></script>`;
  return html(layout(it.title || '詳細', body, { isLoggedIn: true, username: usernameForHeader }), 200, env);
}
