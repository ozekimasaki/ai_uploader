import type { Env, SupabaseUser } from '../env';

export function parseCookies(header: string | null): Record<string, string> {
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

export function getAccessTokenFromRequest(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (auth) {
    const m = /^Bearer\s+(.+)/i.exec(auth);
    if (m) return m[1];
  }
  const ck = parseCookies(req.headers.get('cookie'));
  if (ck['sb-access-token']) return ck['sb-access-token'];
  return null;
}

export async function fetchSupabaseUser(token: string, env: Env): Promise<SupabaseUser | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;
  try {
    const res = await fetch(env.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/user', {
      headers: {
        authorization: 'Bearer ' + token,
        apikey: env.SUPABASE_ANON_KEY,
      },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as SupabaseUser;
    return j && j.id ? j : null;
  } catch {
    return null;
  }
}

export async function getAuthUser(req: Request, env: Env): Promise<SupabaseUser | null> {
  const token = getAccessTokenFromRequest(req);
  if (!token) return null;
  return await fetchSupabaseUser(token, env);
}

export function userDisplayName(user: SupabaseUser): string {
  return String(
    user.user_metadata?.name ||
      user.user_metadata?.full_name ||
      user.user_metadata?.user_name ||
      user.email ||
      '',
  );
}

export function userAvatarUrl(user: SupabaseUser): string {
  return String(user.user_metadata?.avatar_url || '');
}
