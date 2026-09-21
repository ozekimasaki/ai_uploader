import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const OWNER_ID = 'owner-user-1';

function authed(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

async function uploadItem(token: string, visibility: 'public' | 'private', title = 'test item'): Promise<string> {
  const fd = new FormData();
  fd.set('title', title);
  fd.set('category', 'IMAGE');
  fd.set('visibility', visibility);
  fd.set('file', new File([new Uint8Array([137, 80, 78, 71])], 'test.png', { type: 'image/png' }));
  const res = await SELF.fetch('https://example.com/api/upload', {
    method: 'POST',
    headers: { ...authed(token), accept: 'application/json' },
    body: fd,
  });
  const body = (await res.json()) as { ok?: boolean; id?: string };
  expect(res.status).toBe(200);
  expect(body.ok).toBe(true);
  return String(body.id);
}

describe('認証必須', () => {
  it('未ログインの一覧ページは 401 ログイン要求ページ', async () => {
    const res = await SELF.fetch('https://example.com/items');
    expect(res.status).toBe(401);
    expect(await res.text()).toContain('ログインが必要です');
  });

  it('未ログインの API は 401 JSON', async () => {
    const res = await SELF.fetch('https://example.com/api/items');
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe('unauthorized');
  });
});

describe('アップロード〜一覧〜詳細〜ダウンロード', () => {
  it('FormData アップロードでアイテムが作成され一覧に出る', async () => {
    const id = await uploadItem('owner-token', 'public', 'hello world');
    expect(id).toBeTruthy();

    const list = await SELF.fetch('https://example.com/api/items', { headers: authed('other-token') });
    const data = (await list.json()) as { items: { id: string; title: string }[] };
    expect(data.items.some((it) => it.id === id)).toBe(true);

    const detail = await SELF.fetch(`https://example.com/api/items/${id}`, { headers: authed('other-token') });
    const dj = (await detail.json()) as { item: { title: string } };
    expect(dj.item.title).toBe('hello world');
  });

  it('private アイテムは他人の一覧・詳細・ファイル取得ができない', async () => {
    const id = await uploadItem('owner-token', 'private', 'secret item');

    const list = await SELF.fetch('https://example.com/api/items', { headers: authed('other-token') });
    const data = (await list.json()) as { items: { id: string }[] };
    expect(data.items.some((it) => it.id === id)).toBe(false);

    const detail = await SELF.fetch(`https://example.com/api/items/${id}`, { headers: authed('other-token') });
    expect(detail.status).toBe(404);

    // fileKey を推測しても他人は取得できない（IDOR 対策）
    const ownerDetail = await SELF.fetch(`https://example.com/api/items/${id}`, { headers: authed('owner-token') });
    const dj = (await ownerDetail.json()) as { item: { fileKey: string } };
    const stolen = await SELF.fetch(`https://example.com/api/file?k=${encodeURIComponent(dj.item.fileKey)}`, {
      headers: authed('other-token'),
    });
    expect(stolen.status).toBe(404);
    // 所有者は取得可能
    const own = await SELF.fetch(`https://example.com/api/file?k=${encodeURIComponent(dj.item.fileKey)}`, {
      headers: authed('owner-token'),
    });
    expect(own.status).toBe(200);
    expect(own.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('download-url → トークンでダウンロードでき、使い捨て', async () => {
    const id = await uploadItem('owner-token', 'public', 'dl me');
    const res = await SELF.fetch(`https://example.com/api/items/${id}/download-url`, {
      method: 'POST',
      headers: { ...authed('other-token'), 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as { url: string };
    expect(url).toContain('/api/file?t=');

    const file = await SELF.fetch(`https://example.com${url}`, { headers: authed('other-token') });
    expect(file.status).toBe(200);
    expect(file.headers.get('content-disposition')).toContain('attachment');

    // 使い捨て: 2回目は 410
    const again = await SELF.fetch(`https://example.com${url}`, { headers: authed('other-token') });
    expect(again.status).toBe(410);
  });

  it('publish 切替で一覧に出る/消える', async () => {
    const id = await uploadItem('owner-token', 'private', 'toggle me');
    const pub = await SELF.fetch(`https://example.com/api/items/${id}/publish`, {
      method: 'POST',
      headers: { ...authed('owner-token'), 'content-type': 'application/json' },
      body: JSON.stringify({ visibility: 'public' }),
    });
    expect(pub.status).toBe(200);
    const list = await SELF.fetch('https://example.com/api/items', { headers: authed('other-token') });
    expect(((await list.json()) as { items: { id: string }[] }).items.some((it) => it.id === id)).toBe(true);

    // 他人は publish できない
    const forbidden = await SELF.fetch(`https://example.com/api/items/${id}/publish`, {
      method: 'POST',
      headers: { ...authed('other-token'), 'content-type': 'application/json' },
      body: JSON.stringify({ visibility: 'private' }),
    });
    expect(forbidden.status).toBe(403);
  });

  it('Range リクエストは 206 と content-range', async () => {
    const id = await uploadItem('owner-token', 'public', 'ranged');
    const detail = await SELF.fetch(`https://example.com/api/items/${id}`, { headers: authed('owner-token') });
    const { item } = (await detail.json()) as { item: { fileKey: string } };
    const res = await SELF.fetch(`https://example.com/api/file?k=${encodeURIComponent(item.fileKey)}`, {
      headers: { ...authed('owner-token'), range: 'bytes=0-1' },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toMatch(/^bytes 0-1\/\d+$/);
    expect(res.headers.get('accept-ranges')).toBe('bytes');
  });
});

describe('マルチパートアップロード', () => {
  it('init → part → complete → 登録', async () => {
    const init = await SELF.fetch('https://example.com/api/upload/multipart/init', {
      method: 'POST',
      headers: { ...authed('owner-token'), 'content-type': 'application/json' },
      body: JSON.stringify({ filename: 'big.png', contentType: 'image/png' }),
    });
    expect(init.status).toBe(200);
    const { key, uploadId } = (await init.json()) as { key: string; uploadId: string };
    // 所有者のネームスペース配下のキー
    expect(key.startsWith(`uploads/${OWNER_ID}/`)).toBe(true);

    // 他人は同じキーにパートをアップロードできない
    const stolenPart = await SELF.fetch(
      `https://example.com/api/upload/multipart/part?key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}&partNumber=1`,
      { method: 'PUT', headers: authed('other-token'), body: new Uint8Array([1, 2, 3]) },
    );
    expect(stolenPart.status).toBe(403);

    const part = await SELF.fetch(
      `https://example.com/api/upload/multipart/part?key=${encodeURIComponent(key)}&uploadId=${encodeURIComponent(uploadId)}&partNumber=1`,
      { method: 'PUT', headers: authed('owner-token'), body: new Uint8Array([137, 80, 78, 71]) },
    );
    expect(part.status).toBe(200);
    const { etag } = (await part.json()) as { etag: string };
    const complete = await SELF.fetch('https://example.com/api/upload/multipart/complete', {
      method: 'POST',
      headers: { ...authed('owner-token'), 'content-type': 'application/json' },
      body: JSON.stringify({ key, uploadId, parts: [{ partNumber: 1, etag }] }),
    });
    expect(complete.status).toBe(200);

    // 他人の key は登録できない（IDOR）
    const hijack = await SELF.fetch('https://example.com/api/items', {
      method: 'POST',
      headers: { ...authed('other-token'), 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'x', category: 'IMAGE', fileKey: key, originalFilename: 'big.png', contentType: 'image/png', sizeBytes: 4 }),
    });
    expect(hijack.status).toBe(403);

    const reg = await SELF.fetch('https://example.com/api/items', {
      method: 'POST',
      headers: { ...authed('owner-token'), 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'mp item', category: 'IMAGE', visibility: 'public', fileKey: key, originalFilename: 'big.png', contentType: 'image/png', sizeBytes: 4 }),
    });
    expect(reg.status).toBe(200);
    const { id } = (await reg.json()) as { id: string };
    expect(id).toBeTruthy();
  });
});

describe('セキュリティ', () => {
  it('cross-site の変更系 API は拒否（CSRF）', async () => {
    const res = await SELF.fetch('https://example.com/api/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site', cookie: 'sb-access-token=owner-token' },
      body: JSON.stringify({ title: 'x', category: 'IMAGE', fileKey: 'uploads/x/y' }),
    });
    expect(res.status).toBe(403);
  });

  it('HTML にセキュリティヘッダが付く', async () => {
    const res = await SELF.fetch('https://example.com/items', { headers: authed('owner-token') });
    expect(res.status).toBe(200);
    const csp = res.headers.get('content-security-policy') || '';
    expect(csp).toContain('default-src');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN');
  });

  it('ファイル削除は所有者のみ', async () => {
    const id = await uploadItem('owner-token', 'public', 'del me');
    const notOwner = await SELF.fetch(`https://example.com/api/items/${id}`, {
      method: 'DELETE',
      headers: authed('other-token'),
    });
    expect(notOwner.status).toBe(403);
    const del = await SELF.fetch(`https://example.com/api/items/${id}`, {
      method: 'DELETE',
      headers: authed('owner-token'),
    });
    expect(del.status).toBe(200);
    const after = await SELF.fetch(`https://example.com/api/items/${id}`, { headers: authed('owner-token') });
    expect(after.status).toBe(404);
  });
});
