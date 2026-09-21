// アイテム詳細ページ: ダウンロード / 公開切替 / 削除 / 通報 / 共有
(function () {
  'use strict';
  const dataEl = document.getElementById('page-data');
  const data = dataEl ? JSON.parse(dataEl.textContent || '{}') : {};
  const itemId = String(data.itemId || '');
  const fallbackName = String(data.fallbackName || 'download');
  const fileKey = String(data.fileKey || '');

  // SNS 共有リンクを現在の URL で補完
  try {
    const u = encodeURIComponent(location.href);
    const t = encodeURIComponent(document.title || '');
    const x = document.getElementById('btnShareX');
    const l = document.getElementById('btnShareLine');
    const f = document.getElementById('btnShareFb');
    if (x) x.setAttribute('href', 'https://x.com/intent/tweet?url=' + u + '&text=' + t);
    if (l) l.setAttribute('href', 'https://line.me/R/msg/text/?' + t + '%20' + u);
    if (f) f.setAttribute('href', 'https://www.facebook.com/sharer/sharer.php?u=' + u);
  } catch (e) {}

  const btnCopyPrompt = document.getElementById('btnCopyPrompt');
  const promptEl = document.getElementById('promptText');
  btnCopyPrompt?.addEventListener('click', async () => {
    try {
      const text = promptEl?.textContent || '';
      await navigator.clipboard.writeText(text);
      btnCopyPrompt.textContent = 'コピーしました';
      setTimeout(() => (btnCopyPrompt.textContent = 'コピー'), 1500);
    } catch (e) {}
  });

  const btnCopyUrl = document.getElementById('btnCopyUrl');
  btnCopyUrl?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      const prev = btnCopyUrl.getAttribute('title') || '';
      btnCopyUrl.setAttribute('title', 'コピーしました');
      setTimeout(() => btnCopyUrl.setAttribute('title', prev || 'クリックでコピー'), 1500);
    } catch (e) {}
  });

  // 使い捨て URL を発行してダウンロード
  const btnDl = document.getElementById('btnDl');
  const fallbackUrl = '/api/file?k=' + encodeURIComponent(fileKey) + '&download=1&name=' + encodeURIComponent(fallbackName);
  btnDl?.addEventListener('click', async () => {
    try {
      btnDl.setAttribute('disabled', 'true');
      const res = await fetch('/api/items/' + encodeURIComponent(itemId) + '/download-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        credentials: 'same-origin',
      });
      const ct = res.headers.get('content-type') || '';
      const j = ct.includes('application/json') ? await res.json().catch(() => ({})) : {};
      if (res.ok && j?.url) {
        location.href = j.url;
        setTimeout(() => btnDl.removeAttribute('disabled'), 2000);
        return;
      }
      if (res.status === 401) {
        location.href = '/?login=1';
        return;
      }
      if (res.status === 403) {
        alert('このアイテムは非公開です（または権限がありません）');
        btnDl.removeAttribute('disabled');
        return;
      }
      if (res.status === 404) {
        alert('アイテムが見つかりません');
        btnDl.removeAttribute('disabled');
        return;
      }
      if (res.status === 429) {
        const retry = Number(res.headers.get('retry-after') || '0');
        alert('ダウンロードの回数制限に達しました。' + (retry ? '約' + retry + '秒後に再試行してください。' : 'しばらくしてから再試行してください。'));
        btnDl.removeAttribute('disabled');
        return;
      }
      location.href = fallbackUrl;
      setTimeout(() => btnDl.removeAttribute('disabled'), 2000);
    } catch (e) {
      btnDl.removeAttribute('disabled');
    }
  });

  const btnToggle = document.getElementById('btnToggleVis');
  btnToggle?.addEventListener('click', async () => {
    try {
      btnToggle.setAttribute('disabled', 'true');
      const cur = String(data.visibility || 'private');
      const nextVis = cur === 'public' ? 'private' : 'public';
      const res = await fetch('/api/items/' + encodeURIComponent(itemId) + '/publish', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ visibility: nextVis }),
      });
      if (res.ok) {
        location.reload();
        return;
      }
      if (res.status === 403) alert('権限がありません');
      else if (res.status === 404) alert('アイテムが見つかりません');
      else if (res.status === 401) {
        location.href = '/?login=1';
        return;
      } else alert('更新に失敗しました');
      btnToggle.removeAttribute('disabled');
    } catch (e) {
      btnToggle?.removeAttribute('disabled');
    }
  });

  const btnDelete = document.getElementById('btnDelete');
  btnDelete?.addEventListener('click', async () => {
    try {
      if (!confirm('このアイテムを削除します。よろしいですか？')) return;
      btnDelete.setAttribute('disabled', 'true');
      const res = await fetch('/api/items/' + encodeURIComponent(itemId), {
        method: 'DELETE',
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (res.ok) {
        location.href = '/items';
        return;
      }
      if (res.status === 403) alert('権限がありません');
      else if (res.status === 404) alert('アイテムが見つかりません');
      else if (res.status === 401) {
        location.href = '/?login=1';
        return;
      } else alert('削除に失敗しました');
      btnDelete.removeAttribute('disabled');
    } catch (e) {
      btnDelete?.removeAttribute('disabled');
    }
  });

  const btnReport = document.getElementById('btnReport');
  btnReport?.addEventListener('click', async () => {
    try {
      const reason = prompt('通報理由を入力してください（任意）') || '';
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ itemId, reason }),
      });
      if (res.ok) {
        alert('通報を受け付けました。ありがとうございます。');
        return;
      }
      if (res.status === 401) {
        location.href = '/?login=1';
        return;
      }
      alert('通報に失敗しました');
    } catch (e) {}
  });
})();
