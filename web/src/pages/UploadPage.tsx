import React, { useMemo, useState } from 'react';
import { getPublicConfig } from '../lib/config';
import { useAuth } from '../lib/auth';
import { CATEGORY_OPTIONS } from '../lib/constants';

export default function UploadPage() {
  const { session, signIn } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [thumb, setThumb] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('IMAGE');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [publish, setPublish] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [doneId, setDoneId] = useState<string | null>(null);

  const allowedSetMemo = useMemo(async () => {
    const cfg = await getPublicConfig();
    const exts = cfg.allowedFileTypes.split(',').map((s) => s.trim().toLowerCase());
    return new Set(exts);
  }, []);

  async function ensureLoggedIn(): Promise<string> {
    if (!session.accessToken) {
      await signIn();
      throw new Error('ログイン処理中...');
    }
    return session.accessToken;
  }

  function extOf(f: File): string {
    const n = f.name;
    const dot = n.lastIndexOf('.')
    return dot >= 0 ? n.slice(dot + 1).toLowerCase() : '';
  }

  async function presignWithAuth(body: any, token: string) {
    const res = await fetch('/api/upload/presign', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'application/json', 'authorization': `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    let data: any;
    try { data = await res.json(); } catch { data = { error: await res.text() }; }
    if (!res.ok) throw new Error(`${data?.error || 'presignエラー'}: ${data?.message || ''}`);
    return data;
  }

  async function completeMultipart(payload: any, token: string) {
    const res = await fetch('/api/upload/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'application/json', 'authorization': `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`completeエラー: ${await res.text()}`);
  }

  async function uploadMultipart(file: File, presign: any) {
    const partSize = presign.partSizeBytes as number;
    const urls: string[] = presign.urls as string[];
    const parts: Array<{ partNumber: number; etag: string }> = [];
    for (let i = 0; i < urls.length; i++) {
      const start = i * partSize;
      const end = Math.min(file.size, start + partSize);
      const blob = file.slice(start, end);
      setProgress(`アップロード中... (${i + 1}/${urls.length})`);
      const url = urls[i];
      const idx = url.indexOf('#__headers=');
      let headers: Record<string, string> | undefined;
      let putUrl = url;
      if (idx >= 0) {
        putUrl = url.slice(0, idx);
        const encoded = url.slice(idx + '#__headers='.length);
        try { headers = JSON.parse(decodeURIComponent(encoded)); } catch {}
      }
      const put = await fetch(putUrl, { method: 'PUT', body: blob, headers });
      if (!put.ok) throw new Error(`パート${i + 1}アップロード失敗`);
      let etag = put.headers.get('etag') || put.headers.get('ETag') || '';
      if (etag && !etag.startsWith('"')) etag = '"' + etag + '"';
      parts.push({ partNumber: i + 1, etag });
    }
    return parts;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setProgress('');
    setDoneId(null);
    const token = await ensureLoggedIn();
    const cfg = await getPublicConfig();
    if (!file) { setError('ファイルを選択してください'); return; }
    if (!title.trim()) { setError('タイトルは必須です'); return; }
    const allowedSet = await allowedSetMemo;
    const ext = extOf(file);
    if (!allowedSet.has(ext)) { setError('許可されない拡張子です'); return; }
    if (file.size > cfg.maxFileSizeMB * 1024 * 1024) { setError('ファイルサイズが上限を超えています'); return; }

    // 1) main file presign & upload
    setProgress('署名URLを取得中...');
    const presigned = await presignWithAuth({
      originalFilename: file.name,
      contentType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      multipart: true,
    }, token);

    let fileKey: string = presigned.key;
    if (presigned.mode === 'single') {
      setProgress('アップロード中...');
      const put = await fetch(presigned.url, { method: 'PUT', body: file });
      if (!put.ok) throw new Error('アップロード失敗');
    } else if (presigned.mode === 'multipart') {
      const parts = await uploadMultipart(file, presigned);
      await completeMultipart({ key: presigned.key, uploadId: presigned.uploadId, parts }, token);
    } else {
      throw new Error('未知のpresignモード');
    }

    // 2) optional thumbnail
    let thumbnailKey: string | null = null;
    if (thumb) {
      setProgress('サムネイル署名URLを取得中...');
      const presT = await presignWithAuth({
        originalFilename: thumb.name,
        contentType: thumb.type || 'application/octet-stream',
        sizeBytes: thumb.size,
        multipart: false,
      }, token);
      if (presT.url) {
        const putT = await fetch(presT.url, { method: 'PUT', body: thumb });
        if (!putT.ok) throw new Error('サムネイルアップロード失敗');
      }
      thumbnailKey = presT.key;
    }

    // 3) create item metadata
    setProgress('メタデータを登録中...');
    const createRes = await fetch('/api/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'application/json', 'authorization': `Bearer ${token}` },
      body: JSON.stringify({
        title: title.trim(),
        category,
        description: description.trim() || null,
        prompt: prompt.trim() || null,
        fileKey,
        originalFilename: file.name,
        contentType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        extension: ext || null,
        thumbnailKey,
      }),
    });
    let created: any; try { created = await createRes.json(); } catch { created = { error: await createRes.text() }; }
    if (!createRes.ok) throw new Error(`${created?.error || 'メタデータ登録に失敗しました'}: ${created?.message || ''}`);
    const itemId = created.id as string;

    // 4) publish if requested
    if (publish) {
      setProgress('公開処理中...');
      await fetch(`/api/items/${itemId}/publish`, { method: 'POST', headers: { 'authorization': `Bearer ${token}` } });
    }

    setDoneId(itemId);
    setProgress('完了');
  }

  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <h1 className="text-2xl font-bold">アップロード</h1>
      {!session.userId && (
        <div className="p-3 border rounded text-sm">アップロードにはログインが必要です。右上の「ログイン」からサインインしてください。</div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block">
          <div className="text-sm mb-1">タイトル（必須）</div>
          <input className="w-full border rounded px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label className="block">
          <div className="text-sm mb-1">カテゴリー（必須）</div>
          <select className="w-full border rounded px-3 py-2" value={category} onChange={(e) => setCategory(e.target.value)} required>
            {CATEGORY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </label>
        <label className="block md:col-span-2">
          <div className="text-sm mb-1">説明（任意）</div>
          <textarea className="w-full border rounded px-3 py-2" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="block md:col-span-2">
          <div className="text-sm mb-1">Prompt（任意）</div>
          <textarea className="w-full border rounded px-3 py-2" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        </label>
        <label className="block">
          <div className="text-sm mb-1">ファイル（必須）</div>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
        </label>
        <label className="block">
          <div className="text-sm mb-1">サムネイル（任意）</div>
          <input type="file" onChange={(e) => setThumb(e.target.files?.[0] || null)} />
        </label>
        <label className="flex items-center gap-2 md:col-span-2">
          <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
          <span>アップロード後に公開する</span>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button className="px-4 py-2 bg-black text-white rounded" disabled={!file || !session.userId}>
          登録
        </button>
        {progress && <span className="text-sm text-gray-600">{progress}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
        {doneId && <a className="text-sm text-blue-600 underline" href={`/items/${doneId}`}>詳細へ</a>}
      </div>
      <p className="text-xs text-gray-500">注意: EXIF等のメタデータは保持されます（位置情報等が含まれる可能性があります）。</p>
    </form>
  );
}


