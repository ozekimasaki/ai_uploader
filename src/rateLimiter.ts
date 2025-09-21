export class RateLimiter {
  state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/check' && request.method === 'POST') {
      const { key, limit, windowSeconds } = await request.json<any>().catch(() => ({ key: '', limit: 10, windowSeconds: 60 }));
      const allowed = await this.checkLimit(String(key), Number(limit) || 10, Number(windowSeconds) || 60);
      return new Response(JSON.stringify({ allowed }), { headers: { 'content-type': 'application/json' } });
    }
    return new Response('Not Found', { status: 404 });
  }

  private async checkLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const now = Date.now();
    const windowStart = Math.floor(now / (windowSeconds * 1000));
    const storageKey = `${key}:${windowStart}`;
    const current = (await this.state.storage.get<number>(storageKey)) ?? 0;
    if (current >= limit) return false;
    await this.state.storage.put(storageKey, current + 1, { expiration: Math.ceil((windowStart + 1) * windowSeconds) });
    return true;
  }
}

export default RateLimiter;


