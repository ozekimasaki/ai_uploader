// テーマ（light/dark）初期化。描画前に data-mode を確定させるため <head> で同期読み込みする。
(function () {
  try {
    var stored = null;
    try {
      stored = localStorage.getItem('theme');
    } catch (e) {}
    var dark = stored ? stored === 'dark' : window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.setAttribute('data-mode', 'dark');
    else document.documentElement.removeAttribute('data-mode');
  } catch (e) {}
})();
