import { createLocalJWKSet, jwtVerify, type JWTPayload, type JWK } from 'jose';

export interface AuthUser {
  id: string;
}

let cachedJwks: { fetchedAtMs: number; jwks: { keys: JWK[] } } | null = null;
let cachedGetKey: ReturnType<typeof createLocalJWKSet> | null = null;

async function fetchSupabaseJwks(supabaseUrl: string): Promise<{ keys: JWK[] }> {
  const jwksUrl = new URL('/auth/v1/.well-known/jwks.json', supabaseUrl);
  // Use cache API to avoid frequent network calls
  const cacheKey = new Request(jwksUrl.toString(), { method: 'GET' });
  const cached = await caches.default.match(cacheKey);
  if (cached) {
    return (await cached.json()) as { keys: JWK[] };
  }
  const res = await fetch(jwksUrl.toString(), { headers: { 'accept': 'application/json' } });
  if (!res.ok) throw new Error(`Failed to fetch JWKS: ${res.status}`);
  const data = (await res.json()) as { keys: JWK[] };
  await caches.default.put(cacheKey, new Response(JSON.stringify(data), { headers: { 'cache-control': 'public, max-age=300' } }));
  return data;
}

async function getKeyFunction(supabaseUrl: string) {
  const now = Date.now();
  if (!cachedJwks || now - cachedJwks.fetchedAtMs > 5 * 60 * 1000) {
    const jwks = await fetchSupabaseJwks(supabaseUrl);
    cachedJwks = { fetchedAtMs: now, jwks };
    cachedGetKey = createLocalJWKSet(jwks as any);
  }
  return cachedGetKey!;
}

function extractBearer(request: Request): string | null {
  const h = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : null;
}

export async function getUserOrNull(request: Request, env: { SUPABASE_URL: string }): Promise<AuthUser | null> {
  const token = extractBearer(request);
  if (!token) return null;
  try {
    const getKey = await getKeyFunction(env.SUPABASE_URL);
    const { payload } = await jwtVerify(token, getKey, {
      // issuer/audience are not strictly enforced to keep compatibility across Supabase versions
      algorithms: ['RS256', 'RS512', 'ES256', 'EdDSA'] as any,
    });
    const sub = payload.sub;
    if (!sub) return null;
    return { id: sub };
  } catch {
    return null;
  }
}

export async function requireUser(request: Request, env: { SUPABASE_URL: string }): Promise<AuthUser> {
  const user = await getUserOrNull(request, env);
  if (!user) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
    });
  }
  return user;
}


