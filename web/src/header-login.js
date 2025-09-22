// Shared header login bootstrap for both static top and SSR pages
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
  function bind(){
    const btn = document.getElementById('btnHeaderLogin');
    if (btn) btn.addEventListener('click', startLogin, { once: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();

