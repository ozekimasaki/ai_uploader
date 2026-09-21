import type { Env, ItemRow } from '../env';
import { CATEGORIES, CATEGORY_LABELS } from '../env';
import { getAuthUser } from '../lib/auth';
import { ensureTables, getUsernameById, listAllTags, loadTagsForItems, normalizeItemRow } from '../lib/db';
import { html } from '../lib/http';
import { escapeHtml, escapeLike } from '../lib/util';
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
    <div class="card card-hover overflow-hidden">
      <a href="/items/${escapeHtml(it.id)}" class="block bg-kumo-recessed aspect-square">
        <img class="w-full h-full object-cover block" src="${thumbnailUrl(it)}" alt="${escapeHtml(it.title)}" loading="lazy" />
      </a>
      <div class="p-3">
        <div class="flex justify-between items-start gap-2">
          <h2 class="font-semibold text-sm truncate min-w-0"><a href="/items/${escapeHtml(it.id)}" class="text-kumo-strong no-underline hover:underline">${escapeHtml(it.title)}</a></h2>
          <span class="badge shrink-0">${escapeHtml(categoryLabel(it.category))}</span>
        </div>
        <div class="text-kumo-subtle text-xs mt-2 flex items-center gap-3">
          <span><i class="fa-solid fa-download mr-1" aria-hidden="true"></i>${Number(it.downloadCount || 0)}<span class="sr-only">ダウンロード</span></span>
          <span><i class="fa-solid fa-eye mr-1" aria-hidden="true"></i>${Number(it.viewCount || 0)}<span class="sr-only">閲覧</span></span>
        </div>
        ${tags.length ? `<div class="mt-2 flex flex-wrap gap-1">${tags.map((tg) => `<a href="/items?tag=${encodeURIComponent(tg)}" class="badge">#${escapeHtml(tg)}</a>`).join('')}</div>` : ''}
      </div>
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
    const like = `%${escapeLike(q)}%`;
    whereParts.push("(title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' OR id IN (SELECT it.itemId FROM item_tags it JOIN tags t ON t.id = it.tagId WHERE t.label LIKE ? ESCAPE '\\' OR t.id LIKE ? ESCAPE '\\'))");
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
    const body = `<h1 class="page-title">一覧</h1>
    <p class="text-kumo-subtle text-sm mt-2">データ取得に失敗しました。テーブル未作成の可能性があります。</p>
    <pre class="text-kumo-subtle text-xs whitespace-pre-wrap mt-2 well p-3">${escapeHtml(String((e as Error)?.message || e))}</pre>`;
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
  const pager = `<nav class="flex gap-2 mt-5 items-center" aria-label="ページネーション">
    ${page > 1 ? `<a class="btn btn-sm" href="${pageHref(page - 1)}"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i> 前へ</a>` : ''}
    <span class="text-xs text-kumo-subtle" aria-current="page">${page} ページ目</span>
    ${hasNext ? `<a class="btn btn-sm" href="${pageHref(page + 1)}">次へ <i class="fa-solid fa-chevron-right" aria-hidden="true"></i></a>` : ''}
  </nav>`;

  const tagOptions = (await listAllTags(env, 100).catch(() => []))
    .map((tr) => `<option value="${escapeHtml(tr.label)}"></option>`)
    .join('');

  const filters = `
  <form class="mt-4 mb-4 card p-3 grid gap-2 md:grid-cols-[1fr_160px_160px_130px_auto] items-center" method="get" action="/items">
    <div class="relative">
      <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-kumo-placeholder text-xs pointer-events-none"></i>
      <input class="input pl-8" name="q" placeholder="キーワードで検索" aria-label="検索キーワード" value="${escapeHtml(q)}"/>
    </div>
    <select class="input" name="category" aria-label="カテゴリー">
      <option value="">全カテゴリ</option>
      ${CATEGORIES.map((c) => `<option value="${c}" ${categoryParam === c ? 'selected' : ''}>${CATEGORY_LABELS[c]}</option>`).join('')}
    </select>
    <input class="input" name="tag" list="tags" placeholder="タグ" aria-label="タグ" value="${escapeHtml(tagParam)}"/>
    <select class="input" name="sort" aria-label="並び順">
      <option value="new" ${sort === 'new' ? 'selected' : ''}>新着順</option>
      <option value="popular" ${sort === 'popular' ? 'selected' : ''}>人気順</option>
    </select>
    <button class="btn btn-primary"><i class="fa-solid fa-filter" aria-hidden="true"></i> 絞り込み</button>
    <datalist id="tags">${tagOptions}</datalist>
  </form>`;

  const body = `<h1 class="page-title">一覧</h1>
    ${filters}
    <div class="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">${items.map(itemCard).join('') || '<div class="card p-8 text-center text-kumo-subtle text-sm col-span-full"><i class="fa-regular fa-folder-open text-2xl mb-2 block" aria-hidden="true"></i>アイテムがありません</div>'}</div>
    ${pager}`;
  return html(layout('一覧', body, { isLoggedIn: true, username: usernameForHeader }), 200, env);
}
