import type { Env } from '../env';

export function html(s: string, status = 200, env?: Env): Response {
  const res = new Response(s, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
  if (env) applySecurityHeaders(res.headers, env);
  return res;
}

export function json(data: unknown, init: { status?: number; headers?: HeadersInit } = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  headers.set('cache-control', 'no-store');
  const res = new Response(JSON.stringify(data), { status: init.status ?? 200, headers });
  res.headers.set('x-content-type-options', 'nosniff');
  return res;
}

export function jsonError(error: string, status: number, extra?: Record<string, unknown>, headers?: Headers): Response {
  return json({ error, ...extra }, { status, headers });
}

/** HTML / API レスポンス共通のセキュリティヘッダを付与する */
export function applySecurityHeaders(headers: Headers, env: Env): void {
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('frame-ancestors', "'self'");
  headers.set('x-frame-options', 'SAMEORIGIN');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  const supaOrigin = safeOrigin(env.SUPABASE_URL);
  const connectSrc = ['\'self\'', 'https://esm.sh'];
  if (supaOrigin) connectSrc.push(supaOrigin, supaOrigin.replace(/^https:/, 'wss:'));
  // スクリプトは self + CDN のみ（インライン禁止）。スタイルは属性使用箇所があるため unsafe-inline を許容。
  headers.set(
    'content-security-policy',
    [
      "default-src 'self'",
      `script-src 'self' https://cdn.jsdelivr.net https://esm.sh`,
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
      "img-src 'self' data: blob: https://cdn.discordapp.com https://media.discordapp.net",
      "media-src 'self' blob:",
      `connect-src ${connectSrc.join(' ')}`,
      'font-src https://cdnjs.cloudflare.com',
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join('; '),
  );
}

function safeOrigin(u: string | undefined): string {
  try {
    return new URL(String(u || '')).origin;
  } catch {
    return '';
  }
}

/**
 * Cookie 認証の変更系リクエストに対する CSRF 対策。
 * Bearer トークン利用時は対象外。Origin / Sec-Fetch-Site が cross-site の場合は拒否。
 */
export function assertSameOrigin(req: Request, url: URL): Response | null {
  const auth = req.headers.get('authorization');
  if (auth && /^Bearer\s+/i.test(auth)) return null; // Bearer 認証は CSRF 対象外
  const fetchSite = (req.headers.get('sec-fetch-site') || '').toLowerCase();
  if (fetchSite === 'cross-site') {
    return jsonError('forbidden', 403);
  }
  const origin = req.headers.get('origin');
  if (origin) {
    try {
      if (new URL(origin).origin !== url.origin) return jsonError('forbidden', 403);
    } catch {
      return jsonError('forbidden', 403);
    }
  }
  return null;
}
