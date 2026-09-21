import type { Env } from '../env';
import { CATEGORIES, CATEGORY_LABELS } from '../env';
import { getAuthUser } from '../lib/auth';
import { getUsernameById, listAllTags } from '../lib/db';
import { html } from '../lib/http';
import { escapeHtml, jsonForHtml } from '../lib/util';
import { layout } from './layout';

export async function renderUpload(env: Env, req: Request): Promise<Response> {
  let usernameForHeader = '';
  try {
    const authed = await getAuthUser(req, env).catch(() => null);
    if (authed?.id) usernameForHeader = await getUsernameById(env, authed.id).catch(() => '');
  } catch {}

  const tagRows = await listAllTags(env, 200).catch(() => [] as { id: string; label: string }[]);
  const tagChips = tagRows
    .map((r) => `<button type="button" class="badge tag-chip" data-label="${escapeHtml(r.label)}">#${escapeHtml(r.label)}</button>`)
    .join('');

  const pageData = {
    maxFileSizeMb: Number(env.MAX_FILE_SIZE_MB || 2048),
    allowedFileTypes: String(env.ALLOWED_FILE_TYPES || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  };

  const body = `<h1 class="page-title">アップロード</h1>
  <p class="text-kumo-subtle text-sm mt-1 mb-4">AI 生成物（画像・動画・音声・3D モデル等）を登録します。大きなファイルは自動でマルチパートアップロードになります。</p>
  <form id="uploadForm" class="card p-5 space-y-4" method="post" action="/api/upload" enctype="multipart/form-data">
    <div class="grid gap-4 md:grid-cols-2">
      <div>
        <label class="label" for="titleInput">タイトル（必須）</label>
        <input name="title" id="titleInput" required maxlength="200" class="input" placeholder="作品タイトル" />
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="label" for="categoryInput">カテゴリー（必須）</label>
          <select name="category" id="categoryInput" required class="input">
            ${CATEGORIES.map((c) => `<option value="${c}">${CATEGORY_LABELS[c]}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="label" for="visibilityInput">公開範囲</label>
          <select name="visibility" id="visibilityInput" class="input">
            <option value="private">非公開</option>
            <option value="public">公開</option>
          </select>
        </div>
      </div>
    </div>
    <div>
      <label class="label" for="descInput">説明</label>
      <textarea name="description" id="descInput" rows="3" maxlength="5000" class="input" placeholder="作品の説明"></textarea>
    </div>
    <div>
      <label class="label" for="promptInput">Prompt</label>
      <textarea name="prompt" id="promptInput" rows="3" maxlength="10000" class="input font-mono" placeholder="生成に使ったプロンプト"></textarea>
    </div>
    <div>
      <label class="label" for="tagsInput">タグ（最大5・3〜20文字）</label>
      <input name="tags" id="tagsInput" placeholder="カンマ区切りまたは下の一覧から選択" class="input" />
      <div class="mt-2 meta-label">登録済みタグ（クリックで追加）</div>
      <div class="mt-1 flex flex-wrap gap-1" id="tagList">${tagChips || '<span class="text-xs text-kumo-inactive">（タグ未登録）</span>'}</div>
    </div>
    <div>
      <label class="label" id="fileLabel">本体ファイル（必須・最大 ${escapeHtml(String(pageData.maxFileSizeMb))}MB）</label>
      <div id="dropZone" role="button" tabindex="0" aria-labelledby="fileLabel" aria-describedby="fileInfo" class="border-2 border-dashed border-kumo-line rounded-lg p-8 text-center text-sm text-kumo-subtle hover:border-kumo-focus hover:bg-kumo-tint cursor-pointer transition">
        <i class="fa-solid fa-cloud-arrow-up text-2xl text-kumo-brand block mb-2" aria-hidden="true"></i>
        クリックして選択、またはここにドラッグ＆ドロップ
        <input name="file" id="fileInput" type="file" class="hidden" tabindex="-1" aria-hidden="true" />
      </div>
      <div id="fileInfo" class="text-xs text-kumo-subtle mt-1" aria-live="polite"></div>
    </div>
    <div>
      <label class="label" for="thumbInput">サムネイル（任意・画像のみ）</label>
      <input name="thumbnail" id="thumbInput" type="file" accept="image/*" class="block text-sm text-kumo-subtle file:mr-3 file:px-3 file:py-1 file:rounded-md file:border file:border-kumo-line file:bg-kumo-base file:text-kumo-default file:cursor-pointer" />
    </div>
    <div class="pt-1 border-t border-kumo-hairline">
      <button class="btn btn-primary mt-3"><i class="fa-solid fa-upload" aria-hidden="true"></i> アップロード</button>
    </div>
  </form>
  <div id="progressTip" class="fixed bottom-4 right-4 w-72 card hidden" role="status" aria-live="polite" aria-label="アップロード進行状況">
    <div class="px-3 py-2 border-b border-kumo-hairline flex justify-between items-center">
      <div class="text-sm font-medium text-kumo-strong"><i class="fa-solid fa-spinner fa-spin mr-1" aria-hidden="true"></i>アップロード中</div>
      <button id="tipClose" class="text-kumo-subtle hover:text-kumo-strong text-xs">閉じる</button>
    </div>
    <div class="p-3">
      <div class="h-2 bg-kumo-recessed rounded-full overflow-hidden" role="progressbar" aria-label="進捗"><div id="prog" class="bg-kumo-brand h-2 w-0 rounded-full transition-all"></div></div>
      <div id="status" class="text-xs text-kumo-subtle mt-1"></div>
    </div>
  </div>
  <script type="application/json" id="page-data">${jsonForHtml(pageData)}</script>
  <script type="module" src="/upload.js"></script>`;
  return html(layout('アップロード', body, { isLoggedIn: true, username: usernameForHeader }), 200, env);
}
