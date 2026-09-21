import type { Env, ItemRow } from '../env';
import { CATEGORIES, CATEGORY_LABELS } from '../env';
import { getAuthUser } from '../lib/auth';
import { ensureTables, getUsernameById, listAllTags, loadTagsForItems, normalizeItemRow } from '../lib/db';
import { html } from '../lib/http';
import { escapeHtml } from '../lib/util';
import { layout } from './layout';

export function thumbnailUrl(it: { thumbnailKey?: string; fileKey?: string }): string {
  const key = it.thumbnailKey || it.fileKey || '';
  if (!key) return '/favicon.ico';
  const u = new URL('/api/thumbnail', 'https://dummy');
  u.searchParams.set('k', key);
  return u.pathname + '?' + u.searchParams.toString();
}

export function fileUrl(it: { fileKey?: string }): string {
  const fileKey = it.fileKey || '';
  if (!fileKey) return thumbnailUrl(it as { thumbnailKey?: string });
  const u = new URL('/api/file', 'https://dummy');
  u.searchParams.set('k', fileKey);
  return u.pathname + '?' + u.searchParams.toString();
}

function categoryLabel(c: string): string {
  return (CATEGORY_LABELS as Record<string, string>)[String(c).toUpperCase()] ?? c;
}

function itemCard(it: ItemRow & { tags?: string[] }): string {
  const tags = it.tags ?? [];
  return `
    <div class="border border-gray-200 rounded-lg p-3 bg-white">
      <a href="/items/${escapeHtml(it.id)}" class="block bg-gray-100 rounded-md overflow-hidden mb-2 aspect-square">
        <img class="w-full h-full object-cover block" src="${thumbnailUrl(it)}" alt="${escapeHtml(it.title)}" loading="lazy" />
      </a>
      <div class="flex justify-between items-center gap-2">
        <div class="font-semibold truncate">${escapeHtml(it.title)}</div>
        <a class="shrink-0 inline-block px-3 py-1.5 border border-black rounded-md text-black hover:bg-black/5" href="/items/${escapeHtml(it.id)}">詳細</a>
      </div>
      <div class="text-gray-500 text-xs mt-1.5">${escapeHtml(categoryLabel(it.category))}</div>
      <div class="text-gray-500 text-xs mt-1.5">DL: ${Number(it.downloadCount || 0)} / 閲覧: ${Number(it.viewCount || 0)}</div>
      ${tags.length ? `<div class="mt-1.5 flex flex-wrap gap-1">${tags.map((tg) => `<a href="/items?tag=${encodeURIComponent(tg)}" class="text-xs px-2 py-0.5 rounded-full border border-gray-200 hover:bg-black/5">#${escapeHtml(tg)}</a>`).join('')}</div>` : ''}
    </div>
  `;
}

export async function renderItems(env: Env, url: URL, req: Request): Promise<Response> {
  let usernameForHeader = '';
  try {
    const authed = await getAuthUser(req, env).catch(() => null);
    if (authed?.id) usernameForHeader = await getUsernameById(env, authed.id);
  } catch {}

  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
  const pageSize = 20;
  const q = String(url.searchParams.get('q') || '').trim();
  const categoryParam = String(url.searchParams.get('category') || '').trim().toUpperCase();
  const tagParam = String(url.searchParams.get('tag') || '').trim();
  const sort = String(url.searchParams.get('sort') || 'new').trim();

  let items: (ItemRow & { tags: string[] })[] = [];
  let hasNext = false;
  const whereParts: string[] = ["visibility = 'public'"];
  const binds: unknown[] = [];
  if (categoryParam && (CATEGORIES as readonly string[]).includes(categoryParam)) {
    whereParts.push('UPPER(category) = ?');
    binds.push(categoryParam);
  }
  if (q) {
    const like = `%${q}%`;
    whereParts.push("(title LIKE ? OR description LIKE ? OR id IN (SELECT it.itemId FROM item_tags it JOIN tags t ON t.id = it.tagId WHERE t.label LIKE ? OR t.id LIKE ?))");
    binds.push(like, like, like, like);
  }
  if (tagParam) {
    whereParts.push('id IN (SELECT it.itemId FROM item_tags it JOIN tags t ON t.id = it.tagId WHERE t.id = ? OR t.label = ?)');
    binds.push(tagParam, tagParam);
  }
  let orderBy = "COALESCE(createdAt, created_at, '') DESC, rowid DESC";
  if (sort === 'popular') orderBy = "COALESCE(downloadCount, 0) DESC, COALESCE(viewCount, 0) DESC, COALESCE(createdAt, created_at, '') DESC, rowid DESC";

  try {
    await ensureTables(env);
    const limit = pageSize + 1;
    const offset = (page - 1) * pageSize;
    const sql = `SELECT * FROM items WHERE ${whereParts.join(' AND ')} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
    const res = await env.DB.prepare(sql).bind(...binds, limit, offset).all();
    const rows = res.results ?? [];
    hasNext = rows.length > pageSize;
    const mapped = rows.slice(0, pageSize).map((r) => normalizeItemRow(r as Record<string, unknown>));
    const tagMap = await loadTagsForItems(env, mapped.map((it) => it.id)).catch(() => ({} as Record<string, string[]>));
    items = mapped.map((it) => ({ ...it, tags: tagMap[it.id] ?? [] }));
  } catch (e) {
    const body = `<h1 class="text-lg font-semibold">一覧</h1>
    <p class="text-gray-500 text-sm">データ取得に失敗しました。テーブル未作成の可能性があります。</p>
    <pre class="text-gray-500 text-xs whitespace-pre-wrap">${escapeHtml(String((e as Error)?.message || e))}</pre>`;
    return html(layout('一覧', body, { isLoggedIn: true, username: usernameForHeader }), 200, env);
  }

  // ページャはフィルタ条件を保持する
  const baseParams = new URLSearchParams();
  if (q) baseParams.set('q', q);
  if (categoryParam) baseParams.set('category', categoryParam);
  if (tagParam) baseParams.set('tag', tagParam);
  if (sort !== 'new') baseParams.set('sort', sort);
  const pageHref = (p: number) => {
    const sp = new URLSearchParams(baseParams);
    sp.set('page', String(p));
    return `/items?${sp.toString()}`;
  };
  const pager = `<div class="flex gap-2 mt-4">
    ${page > 1 ? `<a class="border border-gray-200 rounded-md px-3 py-1.5" href="${pageHref(page - 1)}">前へ</a>` : ''}
    ${hasNext ? `<a class="border border-gray-200 rounded-md px-3 py-1.5" href="${pageHref(page + 1)}">次へ</a>` : ''}
  </div>`;

  const tagOptions = (await listAllTags(env, 100).catch(() => []))
    .map((tr) => `<option value="${escapeHtml(tr.label)}"></option>`)
    .join('');

  const filters = `
  <form class="mt-2 mb-3 grid gap-2 md:grid-cols-4" method="get" action="/items">
    <input class="border border-gray-300 rounded-md px-3 py-2" name="q" placeholder="キーワード" value="${escapeHtml(q)}"/>
    <select class="border border-gray-300 rounded-md px-3 py-2" name="category">
      <option value="">全カテゴリ</option>
      ${CATEGORIES.map((c) => `<option value="${c}" ${categoryParam === c ? 'selected' : ''}>${CATEGORY_LABELS[c]}</option>`).join('')}
    </select>
    <input class="border border-gray-300 rounded-md px-3 py-2" name="tag" list="tags" placeholder="タグ" value="${escapeHtml(tagParam)}"/>
    <select class="border border-gray-300 rounded-md px-3 py-2" name="sort">
      <option value="new" ${sort === 'new' ? 'selected' : ''}>新着</option>
      <option value="popular" ${sort === 'popular' ? 'selected' : ''}>人気</option>
    </select>
    <div class="md:col-span-4"><button class="mt-1 inline-block px-4 py-2 border border-black rounded-md text-black hover:bg-black/5">絞り込み</button></div>
    <datalist id="tags">${tagOptions}</datalist>
  </form>`;

  const body = `<h1 class="text-lg font-semibold">一覧</h1>
    ${filters}
    <div class="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))] mt-3">${items.map(itemCard).join('') || '<div class="text-gray-500 text-sm">アイテムがありません</div>'}</div>
    ${pager}`;
  return html(layout('一覧', body, { isLoggedIn: true, username: usernameForHeader }), 200, env);
}
