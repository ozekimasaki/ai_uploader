import type { Env } from '../env';
import { html } from '../lib/http';
import { escapeHtml } from '../lib/util';

export interface LayoutOptions {
  isLoggedIn?: boolean;
  username?: string;
}

export function renderHeaderHtml(isLoggedIn: boolean, username?: string): string {
  if (isLoggedIn) {
    const my = username ? `\n            <a href="/u/${escapeHtml(username)}" class="navlink">マイページ</a>` : '';
    return `<a href="/items" class="navlink">一覧</a>
            <a href="/upload" class="navlink">アップロード</a>${my}
            <a href="/logout" class="navlink">ログアウト</a>`;
  }
  return `<button id="btnHeaderLogin" class="btn btn-primary btn-sm"><i class="fa-brands fa-discord"></i> ログイン</button>`;
}

export function renderFooterHtml(): string {
  return `<div class="max-w-[1100px] mx-auto px-4 py-4 text-xs text-kumo-subtle flex justify-between items-center">
    <span>© <span id="y"></span> AI Uploader</span>
    <span>Powered by Cloudflare Workers + Kumo</span>
  </div>`;
}

export function layout(title: string, body: string, opts?: LayoutOptions): string {
  const isLoggedIn = !!opts?.isLoggedIn;
  const username = opts?.username || '';
  return `<!doctype html><html lang="ja"><head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} | AI Uploader</title>
  <link rel="icon" href="/favicon.ico" />
  <script src="/theme.js"></script>
  <link rel="stylesheet" href="/app.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/plyr@3/dist/plyr.css" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
  </head><body class="min-h-screen flex flex-col">
    <header class="sticky top-0 z-10 border-b border-kumo-line bg-kumo-base/90 backdrop-blur">
      <div class="max-w-[1100px] mx-auto px-4 w-full h-14 flex items-center justify-between gap-4">
        <a href="/" class="flex items-center gap-2 font-semibold text-kumo-strong no-underline">
          <span class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-kumo-brand text-kumo-inverse"><i class="fa-solid fa-cloud-arrow-up"></i></span>
          AI Uploader
        </a>
        <nav class="flex gap-1 items-center" data-shared-header>${renderHeaderHtml(isLoggedIn, username)}</nav>
        <button id="btnTheme" class="btn btn-sm" title="テーマ切替" aria-label="テーマ切替"><i class="fa-solid fa-moon"></i></button>
      </div>
    </header>
    <main class="max-w-[1100px] mx-auto px-4 py-6 w-full flex-1">${body}</main>
    <footer class="border-t border-kumo-line">${renderFooterHtml()}</footer>
  <script src="https://cdn.jsdelivr.net/npm/plyr@3/dist/plyr.polyfilled.min.js"></script>
  <script src="/plyr-init.js"></script>
  <script type="module" src="/header-login.js"></script>
  <script type="module" src="/ui-shared.js"></script>
  </body></html>`;
}

export function renderLoginRequiredHtml(): string {
  return `<div class="card max-w-md mx-auto mt-16 p-8 text-center">
  <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-kumo-tint text-kumo-subtle mb-3"><i class="fa-solid fa-lock text-lg"></i></div>
  <h1 class="page-title">ログインが必要です</h1>
  <p class="text-kumo-subtle text-sm mt-2 mb-4">このページの閲覧にはログインが必要です。Discord アカウントでログインしてください。</p>
  <button id="btnHeaderLogin" class="btn btn-primary"><i class="fa-brands fa-discord"></i> Discord でログイン</button>
  </div>`;
}

export function loginRequiredPage(env: Env): Response {
  return html(layout('ログインが必要です', renderLoginRequiredHtml(), { isLoggedIn: false }), 401, env);
}

export function errorPage(env: Env, title: string, message: string, status = 400, opts?: LayoutOptions): Response {
  const body = `<div class="card max-w-md mx-auto mt-16 p-8 text-center">
  <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-kumo-danger-tint text-kumo-danger mb-3"><i class="fa-solid fa-triangle-exclamation text-lg"></i></div>
  <h1 class="page-title">エラー</h1>
  <p class="text-sm text-kumo-danger mt-2">${escapeHtml(message)}</p></div>`;
  return html(layout(title, body, opts), status, env);
}

export function notFoundPage(env: Env, message = 'ページが見つかりません。', opts?: LayoutOptions): Response {
  const body = `<div class="card max-w-md mx-auto mt-16 p-8 text-center">
  <div class="inline-flex items-center justify-center w-12 h-12 rounded-full bg-kumo-tint text-kumo-subtle mb-3"><i class="fa-solid fa-magnifying-glass text-lg"></i></div>
  <h1 class="page-title">見つかりません</h1>
  <p class="text-kumo-subtle text-sm mt-2 mb-4">${escapeHtml(message)}</p>
  <a class="btn" href="/items"><i class="fa-solid fa-arrow-left"></i> 一覧へ戻る</a></div>`;
  return html(layout('見つかりません', body, opts), 404, env);
}
