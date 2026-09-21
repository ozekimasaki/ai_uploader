import type { Env } from '../env';
import { html } from '../lib/http';
import { escapeHtml } from '../lib/util';

export interface LayoutOptions {
  isLoggedIn?: boolean;
  username?: string;
}

export function renderHeaderHtml(isLoggedIn: boolean, username?: string): string {
  if (isLoggedIn) {
    const my = username ? `\n            <a href="/u/${escapeHtml(username)}" class="text-blue-600">マイページ</a>` : '';
    return `<a href="/items" class="text-blue-600">一覧</a>
            <a href="/upload" class="text-blue-600">アップロード</a>${my}
            <a href="/logout" class="text-gray-600">ログアウト</a>`;
  }
  return `<button id="btnHeaderLogin" class="text-blue-600">ログイン</button>`;
}

export function renderFooterHtml(): string {
  return `<div class="max-w-[980px] mx-auto px-4 py-3 text-xs text-gray-500">© <span id="y"></span> AI Uploader</div>`;
}

export function layout(title: string, body: string, opts?: LayoutOptions): string {
  const isLoggedIn = !!opts?.isLoggedIn;
  const username = opts?.username || '';
  return `<!doctype html><html lang="ja"><head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/app.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/plyr@3/dist/plyr.css" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
  </head><body>
    <header class="border-b border-gray-200 h-14 flex items-center">
      <div class="max-w-[980px] mx-auto px-4 w-full flex justify-between">
        <a href="/" class="font-semibold text-gray-900">AI Uploader</a>
        <nav class="flex gap-3" data-shared-header>${renderHeaderHtml(isLoggedIn, username)}</nav>
      </div>
    </header>
    <main class="max-w-[980px] mx-auto px-4 py-4">${body}</main>
    <footer class="border-t border-gray-200">${renderFooterHtml()}</footer>
  <script src="https://cdn.jsdelivr.net/npm/plyr@3/dist/plyr.polyfilled.min.js"></script>
  <script src="/plyr-init.js"></script>
  <script type="module" src="/header-login.js"></script>
  <script type="module" src="/ui-shared.js"></script>
  </body></html>`;
}

export function renderLoginRequiredHtml(): string {
  return `<h1 class="text-lg font-semibold">ログインが必要です</h1>
  <p class="text-gray-500 text-sm mt-1">右上の「ログイン」から認証してください。</p>`;
}

export function loginRequiredPage(env: Env): Response {
  return html(layout('ログインが必要です', renderLoginRequiredHtml(), { isLoggedIn: false }), 401, env);
}

export function errorPage(env: Env, title: string, message: string, status = 400, opts?: LayoutOptions): Response {
  const body = `<h1 class="text-lg font-semibold">エラー</h1><p class="text-sm text-red-600">${escapeHtml(message)}</p>`;
  return html(layout(title, body, opts), status, env);
}

export function notFoundPage(env: Env, message = 'ページが見つかりません。', opts?: LayoutOptions): Response {
  const body = `<h1 class="text-lg font-semibold">見つかりません</h1>
  <p class="text-gray-500 text-sm">${escapeHtml(message)}</p>
  <p><a class="inline-block px-3 py-1.5 border border-black rounded-md text-black hover:bg-black/5" href="/items">一覧へ戻る</a></p>`;
  return html(layout('見つかりません', body, opts), 404, env);
}
