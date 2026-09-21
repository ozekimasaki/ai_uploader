import type { Env, ItemRow } from '../env';
import { CATEGORY_LABELS } from '../env';
import { getAuthUser } from '../lib/auth';
import { ensureTables, getUsernameById, normalizeItemRow } from '../lib/db';
import { html } from '../lib/http';
import { escapeHtml } from '../lib/util';
import { thumbnailUrl } from './items';
import { layout, notFoundPage } from './layout';

export async function renderUser(env: Env, username: string, req: Request): Promise<Response> {
  let viewerId = '';
  let usernameForHeader = '';
  try {
    const authed = await getAuthUser(req, env).catch(() => null);
    viewerId = String(authed?.id || '');
    if (viewerId) usernameForHeader = await getUsernameById(env, viewerId).catch(() => '');
  } catch {}

  await ensureTables(env).catch(() => {});

  type UserRow = { id: string; username: string; displayName: string; avatarUrl: string };
  let targetUser: UserRow | null = null;
  try {
    const row = (await env.DB.prepare('SELECT * FROM users WHERE username = ? LIMIT 1').bind(username).first()) as Record<string, unknown> | null;
    if (row) {
      targetUser = {
        id: String(row.id ?? ''),
        username: String(row.username ?? username),
        displayName: String(row.displayName ?? username),
        avatarUrl: String(row.avatarUrl ?? ''),
      };
    }
  } catch {}
  if (!targetUser) {
    return notFoundPage(env, '指定のユーザーは存在しません。', { isLoggedIn: !!viewerId, username: usernameForHeader });
  }

  const isOwnerView = !!viewerId && viewerId === targetUser.id;
  let items: ItemRow[] = [];
  try {
    const whereVis = isOwnerView ? '1=1' : "visibility = 'public'";
    const sql = `SELECT * FROM items
                 WHERE ownerUserId = ? AND ${whereVis}
                 ORDER BY COALESCE(createdAt, created_at, updatedAt, updated_at, '') DESC, rowid DESC LIMIT 100`;
    const res = await env.DB.prepare(sql).bind(targetUser.id).all();
    items = (res.results ?? []).map((r) => normalizeItemRow(r as Record<string, unknown>));
  } catch {}

  const cards = items
    .map(
      (it) => `
    <div class="card card-hover overflow-hidden">
      <a href="/items/${escapeHtml(it.id)}" class="block bg-kumo-recessed aspect-square">
        <img class="w-full h-full object-cover block" src="${thumbnailUrl(it)}" alt="${escapeHtml(it.title)}" loading="lazy" />
      </a>
      <div class="p-3">
        <div class="flex justify-between items-start gap-2">
          <a href="/items/${escapeHtml(it.id)}" class="font-semibold text-sm text-kumo-strong no-underline hover:underline truncate">${escapeHtml(it.title)}</a>
          <span class="badge shrink-0">${escapeHtml((CATEGORY_LABELS as Record<string, string>)[String(it.category).toUpperCase()] ?? it.category)}</span>
        </div>
        <div class="text-kumo-subtle text-xs mt-2 flex items-center gap-3">
          <span><i class="fa-solid fa-download mr-1"></i>${Number(it.downloadCount || 0)}</span>
          <span><i class="fa-solid fa-eye mr-1"></i>${Number(it.viewCount || 0)}</span>
          ${String(it.visibility).toLowerCase() === 'private' ? '<span class="badge badge-warn"><i class="fa-solid fa-lock"></i> 非公開</span>' : ''}
        </div>
      </div>
    </div>`,
    )
    .join('');

  const avatar = targetUser.avatarUrl
    ? `<img class="w-14 h-14 rounded-full object-cover border border-kumo-line" src="${escapeHtml(targetUser.avatarUrl)}" alt="" referrerpolicy="no-referrer" />`
    : `<span class="inline-flex items-center justify-center w-14 h-14 rounded-full bg-kumo-tint text-kumo-subtle text-xl"><i class="fa-solid fa-user"></i></span>`;

  const body = `
  <div>
    <div class="card p-4 flex items-center gap-4 mb-5">
      ${avatar}
      <div>
        <h1 class="page-title">${escapeHtml(targetUser.displayName)} の作品</h1>
        <div class="text-kumo-subtle text-sm">@${escapeHtml(targetUser.username)} · ${items.length} 件</div>
      </div>
    </div>
    <div class="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">${cards || '<div class="card p-8 text-center text-kumo-subtle text-sm col-span-full"><i class="fa-regular fa-folder-open text-2xl mb-2 block"></i>アイテムがありません</div>'}</div>
  </div>`;
  return html(layout(`${targetUser.displayName} の作品`, body, { isLoggedIn: true, username: usernameForHeader }), 200, env);
}
