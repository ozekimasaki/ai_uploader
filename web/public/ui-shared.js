(function(){
  try{
    var y = document.getElementById('y');
    if (y) y.textContent = String(new Date().getFullYear());
  }catch(e){}
  // テーマ切替（localStorage に保存し html[data-mode] を更新）
  try{
    var btn = document.getElementById('btnTheme');
    function icon(){
      if (!btn) return;
      var dark = document.documentElement.getAttribute('data-mode') === 'dark';
      btn.innerHTML = dark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
      btn.setAttribute('title', dark ? 'ライトモードへ' : 'ダークモードへ');
    }
    icon();
    if (btn) btn.addEventListener('click', function(){
      var dark = document.documentElement.getAttribute('data-mode') === 'dark';
      if (dark) {
        document.documentElement.removeAttribute('data-mode');
        try { localStorage.setItem('theme', 'light'); } catch(e){}
      } else {
        document.documentElement.setAttribute('data-mode', 'dark');
        try { localStorage.setItem('theme', 'dark'); } catch(e){}
      }
      icon();
    });
  }catch(e){}
})();
