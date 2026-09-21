// /auth/callback: OAuth コードをセッションに交換して Cookie を確立する
(async function () {
  'use strict';
  try {
    const cfgRes = await fetch('/auth/config', { credentials: 'same-origin' });
    const cfg = await cfgRes.json().catch(() => ({}));
    if (!cfg?.url || !cfg?.anonKey) {
      location.replace('/?login=1');
      return;
    }
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(cfg.url, cfg.anonKey);
    // PKCE フローのコード交換（新旧メソッド両対応）
    try {
      await supabase.auth.exchangeCodeForSession(window.location.href);
    } catch (e) {}
    try {
      if (typeof supabase.auth.getSessionFromUrl === 'function') {
        await supabase.auth.getSessionFromUrl();
      }
    } catch (e) {}
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (token) {
      await fetch('/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ access_token: token }),
      });
      const params = new URLSearchParams(location.search);
      let dest = params.get('redirect') || '/items';
      // open redirect 対策: 同一オリジンのパスのみ許可
      if (!dest.startsWith('/') || dest.startsWith('//')) dest = '/items';
      location.replace(dest);
    } else {
      location.replace('/?login=1');
    }
  } catch (e) {
    location.replace('/?login=1');
  }
})();
