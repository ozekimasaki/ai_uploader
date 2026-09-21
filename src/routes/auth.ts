import type { Env } from '../env';
import { fetchSupabaseUser, getAuthUser, userDisplayName } from '../lib/auth';
import { ensureTables, getUsernameById, upsertUser } from '../lib/db';
import { html, json, jsonError } from '../lib/http';
import { normalizeUsernameFromId } from '../lib/util';
import { layout } from '../views/layout';

export function authConfig(env: Env): Response {
  return json({ url: env.SUPABASE_URL || '', anonKey: env.SUPABASE_ANON_KEY || '' });
}

export async function authMe(req: Request, env: Env): Promise<Response> {
  const user = await getAuthUser(req, env);
  if (!user) {
    return json({ loggedIn: false });
  }
  try {
    await ensureTables(env);
  } catch {}
  const uid = String(user.id || '');
  let username = '';
  try {
    username = await getUsernameById(env, uid);
  } catch {
    username = normalizeUsernameFromId(uid);
    try {
      await env.DB.prepare('INSERT OR IGNORE INTO users (id, username, displayName) VALUES (?, ?, ?)')
        .bind(uid, username, userDisplayName(user) || username)
        .run();
    } catch {}
  }
  return json({ loggedIn: true, userId: uid, username });
}

export function authCallbackPage(env: Env): Response {
  // OAuth コールバック: 外部 JS でコード交換→Cookie セッション確立→リダイレクト
  const body = `
  <h1 class="text-lg font-semibold">ログイン処理中...</h1>
  <p class="text-gray-500 text-sm">お待ちください。</p>
  <script type="module" src="/auth-callback.js"></script>`;
  return html(layout('ログイン', body, { isLoggedIn: false }), 200, env);
}

export async function authSession(req: Request, env: Env, url: URL): Promise<Response> {
  try {
    const body = (await req.json().catch(() => ({}))) as { access_token?: string };
    const token = String(body?.access_token || '').trim();
    if (!token) return jsonError('bad_request', 400);
    const user = await fetchSupabaseUser(token, env);
    if (!user) return jsonError('unauthorized', 401);
    const isHttps = url.protocol === 'https:';
    const cookieParts = ['sb-access-token=' + token, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
    if (isHttps) cookieParts.push('Secure');
    cookieParts.push('Max-Age=3600');
    const headers = new Headers();
    headers.set('content-type', 'application/json');
    headers.append('Set-Cookie', cookieParts.join('; '));
    try {
      await ensureTables(env);
      await upsertUser(env, user);
    } catch {}
    return new Response(JSON.stringify({ ok: true }), { headers });
  } catch {
    return jsonError('internal', 500);
  }
}

export function logout(url: URL): Response {
  const isHttps = url.protocol === 'https:';
  const headers = new Headers();
  const parts = ['sb-access-token=; Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isHttps) parts.push('Secure');
  headers.append('Set-Cookie', parts.join('; '));
  const dest = url.searchParams.get('redirect') || '/';
  headers.set('Location', dest);
  return new Response(null, { status: 302, headers });
}
