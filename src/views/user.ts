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
    <div class="border border-gray-200 rounded-lg p-3 bg-white">
      <a href="/items/${escapeHtml(it.id)}" class="block bg-gray-100 rounded-md overflow-hidden mb-2 aspect-square">
        <img class="w-full h-full object-cover block" src="${thumbnailUrl(it)}" alt="${escapeHtml(it.title)}" loading="lazy" />
      </a>
      <div class="flex justify-between items-center gap-2">
        <div class="font-semibold truncate">${escapeHtml(it.title)}</div>
        <a class="shrink-0 inline-block px-3 py-1.5 border border-black rounded-md text-black hover:bg-black/5" href="/items/${escapeHtml(it.id)}">詳細</a>
      </div>
      <div class="text-gray-500 text-xs mt-1.5">${escapeHtml((CATEGORY_LABELS as Record<string, string>)[String(it.category).toUpperCase()] ?? it.category)}${String(it.visibility).toLowerCase() === 'private' ? '（非公開）' : ''}</div>
      <div class="text-gray-500 text-xs mt-1.5">DL: ${Number(it.downloadCount || 0)}</div>
    </div>`,
    )
    .join('');

  const avatar = targetUser.avatarUrl
    ? `<img class="w-12 h-12 rounded-full object-cover" src="${escapeHtml(targetUser.avatarUrl)}" alt="" referrerpolicy="no-referrer" />`
    : '';

  const body = `
  <div>
    <div class="flex items-center gap-3">
      ${avatar}
      <div>
        <h1 class="text-lg font-semibold">${escapeHtml(targetUser.displayName)} の作品</h1>
        <div class="text-gray-500 text-sm">@${escapeHtml(targetUser.username)}</div>
      </div>
    </div>
    <div class="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))] mt-3">${cards || '<div class="text-gray-500 text-sm">アイテムがありません</div>'}</div>
  </div>`;
  return html(layout(`${targetUser.displayName} の作品`, body, { isLoggedIn: true, username: usernameForHeader }), 200, env);
}
