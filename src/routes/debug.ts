import type { Env } from '../env';
import { json, jsonError } from '../lib/http';

/** 開発環境限定のデバッグAPI（本番では 404） */
export function isDebugAllowed(env: Env): boolean {
  return String(env.ENVIRONMENT || '').toLowerCase() === 'development';
}

export async function debugRate(env: Env, url: URL, req: Request): Promise<Response> {
  try {
    let name = url.searchParams.get('name') || '';
    if (!name) {
      const scope = String(url.searchParams.get('scope') || 'item');
      if (scope === 'item') {
        const itemId = String(url.searchParams.get('itemId') || '');
        const userId = String(url.searchParams.get('userId') || '');
        const ip = String(url.searchParams.get('ip') || req.headers.get('cf-connecting-ip') || '0.0.0.0');
        if (!itemId || !userId) return jsonError('bad_request', 400);
        name = `rate:${itemId}:${userId}:${ip}`;
      } else if (scope === 'user') {
        const userId = String(url.searchParams.get('userId') || '');
        if (!userId) return jsonError('bad_request', 400);
        name = `rate-user:${userId}`;
      } else if (scope === 'global') {
        name = 'rate-global';
      }
    }
    if (!name) return jsonError('bad_request', 400);
    const stub = env.RATE_LIMITER_DO.get(env.RATE_LIMITER_DO.idFromName(name));
    const resp = await stub.fetch('https://do/debug/rl');
    const j = await resp.json().catch(() => null);
    return json({ name, debug: j });
  } catch (e) {
    return jsonError('internal', 500, { message: String((e as Error)?.message || e) });
  }
}

export async function debugToken(env: Env, url: URL): Promise<Response> {
  try {
    const t = String(url.searchParams.get('t') || '');
    if (!t) return jsonError('bad_request', 400);
    const stub = env.RATE_LIMITER_DO.get(env.RATE_LIMITER_DO.idFromName(`dl-token:${t}`));
    const resp = await stub.fetch('https://do/debug/token');
    const j = await resp.json().catch(() => null);
    return json({ token: t, debug: j });
  } catch (e) {
    return jsonError('internal', 500, { message: String((e as Error)?.message || e) });
  }
}
