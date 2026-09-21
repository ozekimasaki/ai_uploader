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
    .map((r) => `<button type="button" class="px-2 py-0.5 text-xs border border-gray-300 rounded-full hover:bg-black/5 tag-chip" data-label="${escapeHtml(r.label)}">#${escapeHtml(r.label)}</button>`)
    .join('');

  const pageData = {
    maxFileSizeMb: Number(env.MAX_FILE_SIZE_MB || 2048),
    allowedFileTypes: String(env.ALLOWED_FILE_TYPES || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  };

  const body = `<h1 class="text-lg font-semibold">アップロード</h1>
  <form id="uploadForm" class="mt-3 space-y-3" method="post" action="/api/upload" enctype="multipart/form-data">
    <div>
      <label class="block text-xs text-gray-600 mb-1">タイトル（必須）</label>
      <input name="title" required maxlength="200" class="w-full border border-gray-300 rounded-md px-3 py-2" />
    </div>
    <div>
      <label class="block text-xs text-gray-600 mb-1">カテゴリー（必須）</label>
      <select name="category" required class="w-full border border-gray-300 rounded-md px-3 py-2">
        ${CATEGORIES.map((c) => `<option value="${c}">${CATEGORY_LABELS[c]}</option>`).join('')}
      </select>
    </div>
    <div>
      <label class="block text-xs text-gray-600 mb-1">公開範囲</label>
      <select name="visibility" class="w-full border border-gray-300 rounded-md px-3 py-2">
        <option value="private">非公開</option>
        <option value="public">公開</option>
      </select>
    </div>
    <div>
      <label class="block text-xs text-gray-600 mb-1">説明</label>
      <textarea name="description" rows="3" maxlength="5000" class="w-full border border-gray-300 rounded-md px-3 py-2"></textarea>
    </div>
    <div>
      <label class="block text-xs text-gray-600 mb-1">Prompt</label>
      <textarea name="prompt" rows="3" maxlength="10000" class="w-full border border-gray-300 rounded-md px-3 py-2"></textarea>
    </div>
    <div>
      <label class="block text-xs text-gray-600 mb-1">タグ（最大5・3〜20文字）</label>
      <input name="tags" id="tagsInput" placeholder="カンマ区切りまたは下の一覧から選択" class="w-full border border-gray-300 rounded-md px-3 py-2" />
      <div class="mt-2 text-xs text-gray-500">登録済みタグ（クリックで追加）</div>
      <div class="mt-1 flex flex-wrap gap-1" id="tagList">${tagChips || '<span class="text-xs text-gray-400">（タグ未登録）</span>'}</div>
    </div>
    <div>
      <label class="block text-xs text-gray-600 mb-1">本体ファイル（必須・最大 ${escapeHtml(String(pageData.maxFileSizeMb))}MB）</label>
      <div id="dropZone" class="border-2 border-dashed border-gray-300 rounded-md p-6 text-center text-sm text-gray-500 hover:border-gray-400 cursor-pointer">
        クリックして選択、またはここにドラッグ＆ドロップ
        <input name="file" id="fileInput" type="file" required class="hidden" />
      </div>
      <div id="fileInfo" class="text-xs text-gray-500 mt-1"></div>
    </div>
    <div>
      <label class="block text-xs text-gray-600 mb-1">サムネイル（任意）</label>
      <input name="thumbnail" type="file" accept="image/*" class="block" />
    </div>
    <div class="pt-2">
      <button class="inline-block px-4 py-2 border border-black rounded-md text-black hover:bg-black/5">アップロード</button>
    </div>
  </form>
  <div id="progressTip" class="fixed bottom-4 right-4 w-72 shadow-lg rounded-md border border-gray-200 bg-white hidden">
    <div class="px-3 py-2 border-b border-gray-100 flex justify-between items-center">
      <div class="text-sm font-medium">アップロード中</div>
      <button id="tipClose" class="text-gray-400 hover:text-gray-600 text-xs">閉じる</button>
    </div>
    <div class="p-3">
      <div class="h-2 bg-gray-100 rounded overflow-hidden"><div id="prog" class="bg-blue-500 h-2 w-0"></div></div>
      <div id="status" class="text-xs text-gray-500 mt-1"></div>
    </div>
  </div>
  <script type="application/json" id="page-data">${jsonForHtml(pageData)}</script>
  <script type="module" src="/upload.js"></script>`;
  return html(layout('アップロード', body, { isLoggedIn: true, username: usernameForHeader }), 200, env);
}
