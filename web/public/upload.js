// アップロードページ: タグ補助 / ドラッグ&ドロップ / 検証 / マルチパート自動切替
(function () {
  'use strict';
  const dataEl = document.getElementById('page-data');
  const pageData = dataEl ? JSON.parse(dataEl.textContent || '{}') : {};
  const maxFileSizeMb = Number(pageData.maxFileSizeMb || 2048);
  const allowedTypes = Array.isArray(pageData.allowedFileTypes) ? pageData.allowedFileTypes : [];

  // --- タグチップ ---
  const input = document.getElementById('tagsInput');
  const list = document.getElementById('tagList');
  function parseTags(v) {
    return String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
  }
  function addTag(label) {
    const l = String(label || '').trim();
    if (l.length < 3 || l.length > 20 || !input) return;
    const items = parseTags(input.value);
    if (items.includes(l) || items.length >= 5) return;
    items.push(l);
    input.value = items.join(', ');
  }
  list?.addEventListener('click', (e) => {
    const el = e.target instanceof HTMLElement ? e.target.closest('.tag-chip') : null;
    if (!el) return;
    const label = el.getAttribute('data-label');
    if (label) addTag(label);
  });

  // --- ファイル選択 / ドラッグ&ドロップ ---
  const fileEl = document.getElementById('fileInput');
  const dropZone = document.getElementById('dropZone');
  const fileInfo = document.getElementById('fileInfo');
  function describeFile(f) {
    if (!fileInfo) return;
    if (!f) {
      fileInfo.textContent = '';
      return;
    }
    const mb = f.size / (1024 * 1024);
    fileInfo.textContent = f.name + '（' + mb.toFixed(1) + 'MB）';
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (allowedTypes.length && !allowedTypes.includes(ext)) {
      fileInfo.textContent += ' ⚠ 非対応の拡張子の可能性: .' + ext;
    }
    if (mb > maxFileSizeMb) {
      fileInfo.textContent += ' ⚠ 上限 ' + maxFileSizeMb + 'MB を超えています';
    }
  }
  dropZone?.addEventListener('click', () => fileEl?.click());
  // キーボード操作（Enter/Space でファイル選択）
  dropZone?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileEl?.click();
    }
  });
  dropZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-kumo-focus', 'bg-kumo-tint');
  });
  dropZone?.addEventListener('dragleave', () => {
    dropZone.classList.remove('border-kumo-focus', 'bg-kumo-tint');
  });
  dropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-kumo-focus', 'bg-kumo-tint');
    const f = e.dataTransfer?.files?.[0];
    if (f && fileEl) {
      try {
        const dt = new DataTransfer();
        dt.items.add(f);
        fileEl.files = dt.files;
        describeFile(f);
      } catch (err) {}
    }
  });
  fileEl?.addEventListener('change', () => describeFile(fileEl.files?.[0]));

  // --- 送信（マルチパート自動切替） ---
  const form = document.getElementById('uploadForm');
  const bar = document.getElementById('prog');
  const status = document.getElementById('status');
  const tip = document.getElementById('progressTip');
  const tipClose = document.getElementById('tipClose');
  const submitBtn = form?.querySelector('button[type="submit"], button:not([type])');

  function showTip() {
    tip?.classList.remove('hidden');
  }
  tipClose?.addEventListener('click', () => tip?.classList.add('hidden'));
  function setProgress(r) {
    if (bar) bar.style.width = Math.max(0, Math.min(100, r)) + '%';
  }
  async function sha256(buf) {
    const d = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  form?.addEventListener('submit', async (ev) => {
    if (!fileEl?.files?.length) return; // 通常送信フォールバック
    ev.preventDefault();
    const file = fileEl.files[0];
    if (file.size / (1024 * 1024) > maxFileSizeMb) {
      if (status) status.textContent = 'ファイルサイズが上限（' + maxFileSizeMb + 'MB）を超えています';
      showTip();
      return;
    }
    const useMultipart = file.size > 10 * 1024 * 1024; // >10MiB
    let key = '';
    let uploadId = '';
    try {
      showTip();
      setProgress(0);
      if (status) status.textContent = '準備中...';
      submitBtn?.setAttribute('disabled', 'true');
      if (useMultipart) {
        if (status) status.textContent = '初期化中...';
        const init = await fetch('/api/upload/multipart/init', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ filename: file.name, contentType: file.type || 'application/octet-stream' }),
        });
        if (!init.ok) {
          const j = await init.json().catch(() => ({}));
          throw new Error(j?.message || j?.error || '初期化に失敗しました（status ' + init.status + '）');
        }
        const { key: k, uploadId: uid, partSizeBytes } = await init.json();
        key = k;
        uploadId = uid;
        const totalParts = Math.ceil(file.size / partSizeBytes);
        const etags = [];
        const CONCURRENCY = 3;
        let done = 0;
        // 3並列でパートをアップロード
        for (let base = 0; base < totalParts; base += CONCURRENCY) {
          const batch = [];
          for (let i = base; i < Math.min(base + CONCURRENCY, totalParts); i++) {
            const start = i * partSizeBytes;
            const end = Math.min(file.size, start + partSizeBytes);
            const blob = file.slice(start, end);
            const partUrl =
              '/api/upload/multipart/part?key=' + encodeURIComponent(key) + '&uploadId=' + encodeURIComponent(uploadId) + '&partNumber=' + (i + 1);
            batch.push(
              fetch(partUrl, { method: 'PUT', body: blob, credentials: 'same-origin' })
                .then((res) => {
                  if (!res.ok) throw new Error('パート ' + (i + 1) + ' のアップロードに失敗しました');
                  return res.json();
                })
                .then((j) => {
                  etags.push({ partNumber: i + 1, etag: j.etag });
                  done++;
                  if (status) status.textContent = 'アップロード中... (' + done + '/' + totalParts + ')';
                  setProgress((done / totalParts) * 80);
                }),
            );
          }
          await Promise.all(batch);
        }
        if (status) status.textContent = '確定中...';
        const comp = await fetch('/api/upload/multipart/complete', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ key, uploadId, parts: etags.sort((a, b) => a.partNumber - b.partNumber) }),
        });
        if (!comp.ok) throw new Error('確定に失敗しました（status ' + comp.status + '）');
        setProgress(85);
      }
      let digestHex = '';
      if (!useMultipart && file.size <= 64 * 1024 * 1024) {
        if (status) status.textContent = 'ハッシュ計算中...';
        digestHex = await sha256(await file.arrayBuffer());
      }
      if (status) status.textContent = '登録中...';
      const fd = new FormData(form);
      if (key) {
        fd.set('preuploadedKey', key);
        fd.set('filename', file.name);
        fd.set('sizeBytes', String(file.size));
        fd.set('contentType', file.type || 'application/octet-stream');
        fd.delete('file');
      }
      if (digestHex) fd.set('sha256', digestHex);
      const resp = await fetch('/api/upload', { headers: { accept: 'application/json' }, method: 'POST', body: fd, credentials: 'same-origin' });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.ok) {
        if (status) status.textContent = '登録失敗: ' + (data?.message || data?.error || resp.status);
        submitBtn?.removeAttribute('disabled');
        return;
      }
      setProgress(100);
      if (status) {
        status.textContent = '完了';
        const a = document.createElement('a');
        a.href = data.path;
        a.textContent = '詳細を開く';
        a.className = 'link underline ml-2';
        status.appendChild(a);
      }
      submitBtn?.removeAttribute('disabled');
    } catch (err) {
      // マルチパート途中失敗は abort を試行
      if (key && uploadId) {
        try {
          await fetch('/api/upload/multipart/abort', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ key, uploadId }),
          });
        } catch (e2) {}
      }
      if (status) status.textContent = 'エラー: ' + (err?.message || err);
      submitBtn?.removeAttribute('disabled');
    }
  });
})();
