// Shared header login bootstrap for both static top and SSR pages (public)
(function(){
  async function startLogin(){
    try{
      const res = await fetch('/auth/config', { credentials: 'same-origin' });
      const cfg = await res.json().catch(()=>({}));
      if (!cfg?.url || !cfg?.anonKey) { location.href = '/auth/callback'; return; }
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const supabase = createClient(cfg.url, cfg.anonKey);
      const dest = location.pathname + location.search;
      await supabase.auth.signInWithOAuth({
        provider: 'discord',
        options: { redirectTo: location.origin + '/auth/callback?redirect=' + encodeURIComponent(dest) }
      });
    }catch(e){ console.error(e); }
  }
  async function bind(){
    try{
      // Optimistically swap header once logged in
      const me = await fetch('/auth/me', { credentials: 'same-origin' }).then(r=>r.json()).catch(()=>({loggedIn:false}));
      if (me?.loggedIn) {
        const nav = document.querySelector('[data-shared-header]');
        if (nav) {
          const my = me.username ? `<a href="/u/${me.username}" class="navlink">マイページ</a>` : '';
          nav.innerHTML = `<a href="/items" class="navlink">一覧</a>\n<a href="/upload" class="navlink">アップロード</a>\n${my}\n<a href="/logout" class="navlink">ログアウト</a>`;
        }
      }
    }catch(e){}
    // ログインボタン（ヘッダ・ヒーロー・ログイン要求カード）にまとめてバインド
    document.querySelectorAll('#btnHeaderLogin, #btnHeroLogin').forEach((b) => {
      b.addEventListener('click', startLogin, { once: true });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
