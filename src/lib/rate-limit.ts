import type { Env } from '../env';

export interface RateLimitResult {
  allowed: boolean;
  resetAt: number;
}

/** DO 障害時はサービス継続を優先して許可側に倒す */
export async function enforceRateLimitByDo(name: string, windowSec: number, limit: number, env: Env): Promise<RateLimitResult> {
  try {
    const id = env.RATE_LIMITER_DO.idFromName(name);
    const stub = env.RATE_LIMITER_DO.get(id);
    const resp = await stub.fetch(`https://do/limit?window=${windowSec}&limit=${limit}`, { method: 'POST' });
    const j = (await resp.json().catch(() => ({ allowed: true }))) as { allowed?: boolean; resetAt?: number };
    return { allowed: j?.allowed !== false, resetAt: Number(j?.resetAt || 0) };
  } catch {
    return { allowed: true, resetAt: 0 };
  }
}

/** 同名キーの一定期間内の重複を抑止（閲覧/DLカウント用）。失敗時は許可。 */
export async function dedupeCheck(name: string, ttlSec: number, env: Env): Promise<boolean> {
  try {
    const stub = env.RATE_LIMITER_DO.get(env.RATE_LIMITER_DO.idFromName(name));
    const res = await stub.fetch(`https://do/check?ttl=${ttlSec}`, { method: 'POST' });
    const j = (await res.json().catch(() => ({ allowed: true }))) as { allowed?: boolean };
    return j?.allowed !== false;
  } catch {
    return true;
  }
}

export interface DownloadTokenData {
  itemId: string;
  userId: string;
  fileKey: string;
  expireAtMs: number;
  oneTime: boolean;
  used: boolean;
}

export async function createDownloadToken(token: string, data: Omit<DownloadTokenData, 'used'>, env: Env): Promise<void> {
  const stub = env.RATE_LIMITER_DO.get(env.RATE_LIMITER_DO.idFromName(`dl-token:${token}`));
  await stub.fetch('https://do/token/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function getDownloadToken(token: string, env: Env): Promise<DownloadTokenData | null> {
  const stub = env.RATE_LIMITER_DO.get(env.RATE_LIMITER_DO.idFromName(`dl-token:${token}`));
  const resp = await stub.fetch('https://do/token/get', { method: 'GET' });
  return (await resp.json().catch(() => null)) as DownloadTokenData | null;
}

export async function consumeDownloadToken(token: string, env: Env): Promise<void> {
  const stub = env.RATE_LIMITER_DO.get(env.RATE_LIMITER_DO.idFromName(`dl-token:${token}`));
  await stub.fetch('https://do/token/consume', { method: 'POST' });
}
