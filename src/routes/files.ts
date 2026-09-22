import type { Env, SupabaseUser } from '../env';
import { ensureTables, fetchItemByFileKey } from '../lib/db';
import { consumeDownloadToken, dedupeCheck, getDownloadToken } from '../lib/rate-limit';
import { contentDispositionFilename } from '../lib/util';

const PLACEHOLDER_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

export function placeholderPng(): Response {
  const buf = Uint8Array.from(atob(PLACEHOLDER_PNG_BASE64), (c) => c.charCodeAt(0));
  return new Response(buf, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' } });
}

interface ParsedRange {
  offset?: number;
  length?: number;
  suffix?: number;
}

function parseRangeHeader(header: string, size: number): ParsedRange | 'invalid' | null {
  // 非対応の形式（複数レンジ等）は RFC 的に Range を無視して 200 で返す
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, startS, endS] = m;
  if (startS === '' && endS === '') return null;
  if (startS === '') {
    // suffix: 末尾 N バイト
    const suffix = Number(endS);
    if (!Number.isFinite(suffix) || suffix <= 0) return 'invalid';
    return { suffix };
  }
  const offset = Number(startS);
  if (!Number.isFinite(offset) || offset < 0 || offset >= size) return 'invalid';
  if (endS === '') return { offset };
  const end = Number(endS);
  if (!Number.isFinite(end) || end < offset) return 'invalid';
  return { offset, length: Math.min(end, size - 1) - offset + 1 };
}

/** Range 条件から実際のオフセット/長さを計算（content-range 表示用） */
function resolveRange(range: ParsedRange, size: number): { offset: number; length: number } {
  if (range.suffix !== undefined) {
    const length = Math.min(range.suffix, size);
    return { offset: size - length, length };
  }
  const offset = range.offset ?? 0;
  const length = range.length !== undefined ? Math.min(range.length, size - offset) : size - offset;
  return { offset, length };
}

async function countDownload(env: Env, fileKey: string, req: Request): Promise<void> {
  try {
    await ensureTables(env);
    const it = await fetchItemByFileKey(env, fileKey);
    if (!it) return;
    const ip = req.headers.get('cf-connecting-ip') || '0.0.0.0';
    const ok = await dedupeCheck(`dl:${it.id}:${ip}`, 3600, env);
    if (ok) {
      await env.DB.prepare('UPDATE items SET downloadCount = COALESCE(downloadCount, 0) + 1 WHERE id = ?').bind(it.id).run();
    }
  } catch {}
}

/**
 * ファイル配信。認可は次のいずれか:
 *  - 有効な使い捨てトークン t（download-url API が発行）
 *  - ログイン済み + 対象アイテムが public、または閲覧者が所有者
 */
export async function serveFile(req: Request, env: Env, url: URL, user: SupabaseUser | null): Promise<Response> {
  // 暫定仕様: ファイル配信は常にログイン必須（トークン利用でも認証は必要）
  if (!user) return new Response('unauthorized', { status: 401 });
  let key = url.searchParams.get('k');
  const token = url.searchParams.get('t') || '';
  let authorizedByToken = false;

  if (token) {
    // ここでは検証のみ。消費は GET で配信可能と確認してから行う
    // （HEAD 先行のダウンロードマネージャーや、R2 取得失敗でトークンを無駄にしない）
    const dat = await getDownloadToken(token, env).catch(() => null);
    if (!dat || !dat.fileKey || dat.expireAtMs < Date.now() || dat.used) {
      return new Response('expired', { status: 410 });
    }
    key = dat.fileKey;
    authorizedByToken = true;
  }

  if (!key) return new Response('missing k', { status: 400 });
  if (key.includes('..')) return new Response('bad key', { status: 400 });

  // トークン以外の直接アクセスはアイテムの公開範囲で認可
  if (!authorizedByToken) {
    const it = await fetchItemByFileKey(env, key);
    if (!it) return new Response('not found', { status: 404 });
    const isOwner = !!user.id && user.id === it.ownerUserId;
    if (String(it.visibility).toLowerCase() !== 'public' && !isOwner) {
      return new Response('not found', { status: 404 });
    }
  }

  try {
    const rangeHeader = req.headers.get('range');
    const headObj = rangeHeader ? await env.R2.head(key) : null;
    const totalSize = headObj?.size ?? 0;
    let options: R2GetOptions | undefined;
    let status = 200;
    let resolved: { offset: number; length: number } | null = null;

    if (rangeHeader && headObj) {
      const parsed = parseRangeHeader(rangeHeader, totalSize);
      if (parsed === 'invalid') {
        const h = new Headers({ 'content-range': `bytes */${totalSize}` });
        return new Response(null, { status: 416, headers: h });
      }
      if (parsed) {
        resolved = resolveRange(parsed, totalSize);
        options = { range: { offset: resolved.offset, length: resolved.length } };
        status = 206;
      }
    }

    const obj = rangeHeader ? await env.R2.get(key, options) : await env.R2.get(key);
    if (!obj) return new Response('not found', { status: 404 });

    // 使い捨てトークンは GET のみ・オブジェクト確認後に消費。消費失敗時は配信しない
    if (authorizedByToken && req.method === 'GET') {
      try {
        await consumeDownloadToken(token, env);
      } catch {
        return new Response('expired', { status: 410 });
      }
    }

    const headers = new Headers();
    const ct = obj.httpMetadata?.contentType || 'application/octet-stream';
    headers.set('content-type', ct);
    headers.set('cache-control', 'private, max-age=3600');
    headers.set('accept-ranges', 'bytes');
    headers.set('x-content-type-options', 'nosniff');
    if (obj.httpEtag) headers.set('etag', obj.httpEtag);
    headers.set('content-length', String(resolved ? resolved.length : obj.size));
    if (status === 206 && resolved) {
      headers.set('content-range', `bytes ${resolved.offset}-${resolved.offset + resolved.length - 1}/${obj.size || totalSize}`);
    }
    const dl = url.searchParams.get('download');
    const given = url.searchParams.get('name') || '';
    const fallback = key.split('/').pop() || 'download';
    headers.set('content-disposition', contentDispositionFilename(given || fallback, dl ? 'attachment' : 'inline'));

    if (dl && req.method === 'GET') {
      await countDownload(env, key, req);
    }
    if (req.method === 'HEAD') {
      return new Response(null, { status, headers });
    }
    return new Response(obj.body, { status, headers });
  } catch {
    return new Response('error', { status: 500 });
  }
}

/** サムネイル配信。アイテムに紐づくキーのみ許可（public か所有者）。 */
export async function serveThumbnail(_req: Request, env: Env, url: URL, user: SupabaseUser | null): Promise<Response> {
  if (!user) return new Response('unauthorized', { status: 401 });
  const key = url.searchParams.get('k');
  if (!key) return new Response('missing k', { status: 400 });
  if (key.includes('..')) return new Response('bad key', { status: 400 });
  try {
    const it = await fetchItemByFileKey(env, key);
    if (it) {
      const isOwner = !!user.id && user.id === it.ownerUserId;
      if (String(it.visibility).toLowerCase() !== 'public' && !isOwner) {
        return new Response('not found', { status: 404 });
      }
    }
    // アイテムに紐づかないキー（登録前など）は所有者プレフィックスのみ許可
    if (!it && !key.startsWith(`uploads/${user.id}/`)) {
      return new Response('not found', { status: 404 });
    }
    const obj = await env.R2.get(key);
    if (!obj) return placeholderPng();
    const headers = new Headers();
    // サムネイルは画像専用。text/html 等が登録された場合はバイナリとして返す（XSS 対策）
    const ct = obj.httpMetadata?.contentType || 'image/jpeg';
    headers.set('content-type', ct.startsWith('image/') ? ct : 'application/octet-stream');
    headers.set('cache-control', 'private, max-age=3600');
    headers.set('x-content-type-options', 'nosniff');
    if (obj.httpEtag) headers.set('etag', obj.httpEtag);
    return new Response(obj.body, { headers });
  } catch {
    return placeholderPng();
  }
}
