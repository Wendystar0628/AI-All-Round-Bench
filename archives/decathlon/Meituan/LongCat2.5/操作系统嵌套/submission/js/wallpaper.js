'use strict';
// ============ 壁纸 ============
(function (NS) {
  const WP = {};
  WP.get = function (sys) {
    const settings = NS.SettingsStore.get(sys);
    if (settings && settings.wallpaper) return settings.wallpaper;
    return 'assets/wallpaper.png';
  };
  WP.list = function () {
    return [
      { id: 'default', name: '黄昏山谷', url: 'assets/wallpaper.png' },
      { id: 'dusk', name: '暮光', url: 'assets/wallpaper-dusk.png' },
      { id: 'forest', name: '林间', url: 'assets/wallpaper-forest.png' }
    ];
  };
  WP.apply = function (sys, url) {
    const s = NS.SettingsStore.get(sys);
    s.wallpaper = url;
    NS.SettingsStore.save(sys, s);
    if (sys.desktop) sys.desktop.setWallpaper(url);
  };
  NS.Wallpaper = WP;
})(window.NOS = window.NOS || {});