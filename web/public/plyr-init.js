// Plyr の初期化（存在する video/audio に適用）
try {
  if (window.Plyr) {
    document.querySelectorAll('video').forEach((el) => new window.Plyr(el));
    document.querySelectorAll('audio').forEach((el) => new window.Plyr(el));
  }
} catch (e) {}
