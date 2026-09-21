import type { Env } from './env';
import { getAuthUser } from './lib/auth';
import { applySecurityHeaders, assertSameOrigin, jsonError } from './lib/http';
import { authCallbackPage, authConfig, authMe, authSession, logout } from './routes/auth';
import { debugRate, debugToken, isDebugAllowed } from './routes/debug';
import { serveFile, serveThumbnail } from './routes/files';
import {
  createItemApi,
  createReportApi,
  deleteItemApi,
  downloadUrlApi,
  getItemApi,
  listItemsApi,
  publishItemApi,
} from './routes/items';
import { uploadForm, uploadMultipartAbort, uploadMultipartComplete, uploadMultipartInit, uploadMultipartPart } from './routes/upload';
import { renderItem } from './views/item';
import { renderItems } from './views/items';
import { loginRequiredPage, notFoundPage } from './views/layout';
import { renderUpload } from './views/upload';
import { renderUser } from './views/user';

export { RateLimiter } from './do/rate-limiter';
export type { Env };

function isProtectedPage(method: string, path: string): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  return (
    path === '/' ||
    path === '/items' ||
    /^\/items\/[A-Za-z0-9_-]+$/.test(path) ||
    /^\/u\/[A-Za-z0-9_-]+$/.test(path) ||
    path === '/upload'
  );
}

/** ASSETS 配信（HTML）にもセキュリティヘッダを付与する */
function withAssetSecurityHeaders(res: Response, env: Env): Response {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('text/html')) return res;
  const headers = new Headers(res.headers);
  applySecurityHeaders(headers, env);
  return new Response(res.body, { status: res.status, headers });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // 正規化: /index.html → /
    if (path === '/index.html') {
      return Response.redirect(new URL('/', url.origin), 301);
    }

    // --- 認証系 ---
    if (path === '/auth/config' && method === 'GET') return authConfig(env);
    if (path === '/auth/me' && method === 'GET') return authMe(req, env);
    if (path === '/auth/callback' && method === 'GET') return authCallbackPage(env);
    if (path === '/auth/session' && method === 'POST') return authSession(req, env, url);
    if (path === '/logout' && (method === 'GET' || method === 'POST')) return logout(url);

    // --- 保護ページ（暫定: 全画面ログイン必須） ---
    if (isProtectedPage(method, path)) {
      const user = await getAuthUser(req, env);
      if (!user) return loginRequiredPage(env);
    }

    // --- 変更系 API の CSRF 対策（Cookie 認証時のみ） ---
    const isMutationApi = path.startsWith('/api/') && (method === 'POST' || method === 'PUT' || method === 'DELETE');
    if (isMutationApi) {
      const csrf = assertSameOrigin(req, url);
      if (csrf) return csrf;
    }

    // --- マルチパートアップロード API ---
    if (path.startsWith('/api/upload/multipart/')) {
      if (method !== 'POST' && method !== 'PUT') return jsonError('not_found', 404);
      const user = await getAuthUser(req, env);
      if (!user) return jsonError('unauthorized', 401);
      if (path === '/api/upload/multipart/init' && method === 'POST') return uploadMultipartInit(req, env, user);
      if (path === '/api/upload/multipart/part' && method === 'PUT') return uploadMultipartPart(req, env, url, user);
      if (path === '/api/upload/multipart/complete' && method === 'POST') return uploadMultipartComplete(req, env, user);
      if (path === '/api/upload/multipart/abort' && method === 'POST') return uploadMultipartAbort(req, env, user);
      return jsonError('not_found', 404);
    }

    // --- アップロード（FormData。preuploadedKey 経由もここ） ---
    if (path === '/api/upload' && method === 'POST') {
      return uploadForm(req, env, url);
    }

    // --- items API ---
    if (path === '/api/items' && method === 'GET') {
      const user = await getAuthUser(req, env);
      if (!user) return jsonError('unauthorized', 401);
      return listItemsApi(env, url);
    }
    if (path === '/api/items' && method === 'POST') {
      const user = await getAuthUser(req, env);
      if (!user) return jsonError('unauthorized', 401);
      return createItemApi(req, env, user);
    }
    {
      const m = /^\/api\/items\/([A-Za-z0-9_-]+)\/publish$/.exec(path);
      if (m && method === 'POST') {
        const user = await getAuthUser(req, env);
        if (!user) return jsonError('unauthorized', 401);
        return publishItemApi(req, env, m[1], user);
      }
    }
    {
      const m = /^\/api\/items\/([A-Za-z0-9_-]+)\/download-url$/.exec(path);
      if (m && method === 'POST') {
        const user = await getAuthUser(req, env);
        if (!user) return jsonError('unauthorized', 401);
        return downloadUrlApi(req, env, url, m[1], user);
      }
    }
    {
      const m = /^\/api\/items\/([A-Za-z0-9_-]+)$/.exec(path);
      if (m && method === 'GET') {
        const user = await getAuthUser(req, env);
        if (!user) return jsonError('unauthorized', 401);
        return getItemApi(env, m[1], user);
      }
      if (m && method === 'DELETE') {
        const user = await getAuthUser(req, env);
        if (!user) return jsonError('unauthorized', 401);
        return deleteItemApi(env, m[1], user);
      }
    }

    // --- 通報 API ---
    if (path === '/api/reports' && method === 'POST') {
      const user = await getAuthUser(req, env);
      if (!user) return jsonError('unauthorized', 401);
      return createReportApi(req, env, user);
    }

    // --- デバッグ API（開発環境のみ・要ログイン） ---
    if (path.startsWith('/api/debug/')) {
      if (!isDebugAllowed(env)) return jsonError('not_found', 404);
      const user = await getAuthUser(req, env);
      if (!user) return jsonError('unauthorized', 401);
      if (path === '/api/debug/rate' && method === 'GET') return debugRate(env, url, req);
      if (path === '/api/debug/token' && method === 'GET') return debugToken(env, url);
      return jsonError('not_found', 404);
    }

    // --- ファイル / サムネイル配信 ---
    if (path === '/api/file' && (method === 'GET' || method === 'HEAD')) {
      const user = await getAuthUser(req, env);
      return serveFile(req, env, url, user);
    }
    if (path === '/api/thumbnail' && (method === 'GET' || method === 'HEAD')) {
      const user = await getAuthUser(req, env);
      return serveThumbnail(req, env, url, user);
    }

    if (path.startsWith('/api/')) return jsonError('not_found', 404);

    // --- SSR ページ（ログイン済みのみ到達） ---
    if (method === 'GET') {
      if (path === '/' || path === '/items') return renderItems(env, url, req);
      const m = /^\/items\/([A-Za-z0-9_-]+)$/.exec(path);
      if (m) return renderItem(env, m[1], req, ctx);
      const mu = /^\/u\/([a-z0-9]{3,32})$/.exec(path);
      if (mu) return renderUser(env, mu[1], req);
      if (path === '/upload') return renderUpload(env, req);
      if (path === '/404') return notFoundPage(env);
    }

    // --- 静的アセット → フォールバック ---
    const res = await env.ASSETS.fetch(req);
    if (res.status !== 404) return withAssetSecurityHeaders(res, env);
    if ((req.headers.get('accept') || '').includes('text/html')) {
      const fallback = await env.ASSETS.fetch(new Request(new URL('/index.html', url.origin), req));
      return withAssetSecurityHeaders(fallback, env);
    }
    return res;
  },
} satisfies ExportedHandler<Env>;
