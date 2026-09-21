/**
 * RateLimiter Durable Object
 * - /limit        固定窓レート制御
 * - /check        TTL 付き重複抑止（閲覧・DL カウント用）
 * - /token/*      使い捨てダウンロードトークン管理
 * - /debug/*      開発用の内部状態確認（Worker 側で環境制限済み）
 */
export class RateLimiter implements DurableObject {
  state: DurableObjectState;
  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (request.method === 'POST' && url.pathname === '/check') {
        const ttl = Number(url.searchParams.get('ttl') || '3600');
        const key = 'check:hit';
        const prev = await this.state.storage.get<number>(key);
        const now = Date.now();
        if (prev && now - prev < ttl * 1000) {
          return new Response(JSON.stringify({ allowed: false }), { headers: { 'content-type': 'application/json' } });
        }
        await this.state.storage.put(key, now);
        return new Response(JSON.stringify({ allowed: true }), { headers: { 'content-type': 'application/json' } });
      }

      if (request.method === 'POST' && url.pathname === '/limit') {
        const windowSec = Math.max(1, Number(url.searchParams.get('window') || '60'));
        const limit = Math.max(1, Number(url.searchParams.get('limit') || '10'));
        const now = Date.now();
        const data = (await this.state.storage.get<{ windowStart: number; count: number }>('rl:data')) || null;
        let windowStart = data?.windowStart || 0;
        let count = data?.count || 0;
        if (!windowStart || now - windowStart >= windowSec * 1000) {
          windowStart = now;
          count = 0;
        }
        count += 1;
        const allowed = count <= limit;
        const resetAt = windowStart + windowSec * 1000;
        await this.state.storage.put('rl:data', { windowStart, count });
        return new Response(JSON.stringify({ allowed, remaining: Math.max(0, limit - count), resetAt }), {
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.pathname === '/token/create' && request.method === 'POST') {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const tokenData = {
          itemId: String(body?.itemId || ''),
          userId: String(body?.userId || ''),
          fileKey: String(body?.fileKey || ''),
          expireAtMs: Number(body?.expireAtMs || 0),
          oneTime: !!body?.oneTime,
          used: false,
        };
        await this.state.storage.put('dl:token', tokenData);
        return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
      }
      if (url.pathname === '/token/get' && request.method === 'GET') {
        const tokenData = await this.state.storage.get('dl:token');
        return new Response(JSON.stringify(tokenData || null), { headers: { 'content-type': 'application/json' } });
      }
      if (url.pathname === '/token/consume' && request.method === 'POST') {
        const tokenData = (await this.state.storage.get<Record<string, unknown>>('dl:token')) || null;
        if (tokenData) {
          tokenData.used = true;
          await this.state.storage.put('dl:token', tokenData);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
      }

      if (url.pathname === '/debug/rl' && request.method === 'GET') {
        const data = (await this.state.storage.get('rl:data')) || null;
        return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
      }
      if (url.pathname === '/debug/token' && request.method === 'GET') {
        const data = (await this.state.storage.get('dl:token')) || null;
        return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
      }
    } catch {}
    return new Response(JSON.stringify({ allowed: true }), { headers: { 'content-type': 'application/json' } });
  }
}
