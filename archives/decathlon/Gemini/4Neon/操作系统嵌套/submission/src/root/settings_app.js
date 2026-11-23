// Root Settings App ('settings')
// Modifies system name, wallpaper, accent color, UI scale, & Do-Not-Disturb
// Shares state directly with Quick Settings & persists inside --data-dir!

export const WALLPAPERS = [
  { value: 'alpine', label: '暮色雪山湖泊（默认）', src: 'assets/wallpapers/outer-alpine.svg' },
  { value: 'aurora', label: '极光冰峰', src: 'assets/wallpapers/outer-aurora.svg' },
  { value: 'coast', label: '琥珀海岸', src: 'assets/wallpapers/outer-coast.svg' },
  { value: 'desert', label: '暮光沙丘', src: 'assets/wallpapers/outer-desert.svg' },
];

export const ACCENTS = [
  { value: '#38bdf8', label: '晴空蓝' },
  { value: '#a855f7', label: '星云紫' },
  { value: '#f59e0b', label: '耀金橙' },
  { value: '#10b981', label: '翡翠青' },
  { value: '#f43f5e', label: '绯红玫' },
];

export const SCALES = [
  { value: '0.9', label: '90%' },
  { value: '1', label: '100%（默认）' },
  { value: '1.15', label: '115%' },
  { value: '1.25', label: '125%' },
];

export function mountRootSettingsApp(os, win, bodyEl) {
  const render = () => {
    const s = os.settings;
    bodyEl.innerHTML = `
      <div class="settings-shell">
        <div class="set-group">
          <div class="set-title">系统名称</div>
          <div class="set-row">
            <input class="nos-input set-name-in" type="text" value="${s.systemName}" aria-label="系统名称"/>
            <button class="btn-xs btn-accent set-name-save">应用名称</button>
          </div>
        </div>

        <div class="set-group">
          <div class="set-title">桌面壁纸（原创本地矢量风景图）</div>
          <div class="set-wallpapers">
            ${WALLPAPERS.map((wp) => `
              <button class="wp-card${s.wallpaper === wp.value ? ' active' : ''}"
                data-testid="settings-wallpaper" data-system-id="outer" data-window-id="${win.id}" data-value="${wp.value}"
                aria-label="壁纸：${wp.label}">
                <img src="${wp.src}" alt="${wp.label}"/>
                <span>${wp.label}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="set-group">
          <div class="set-title">强调色</div>
          <div class="set-accents">
            ${ACCENTS.map((ac) => `
              <button class="ac-pill${s.accent === ac.value ? ' active' : ''}"
                data-testid="settings-accent" data-system-id="outer" data-window-id="${win.id}" data-value="${ac.value}"
                aria-label="强调色：${ac.label}">
                <i style="background:${ac.value}"></i><span>${ac.label}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <div class="set-group">
          <div class="set-title">界面缩放（缩放后窗口拖动与嵌套命中均保持精确）</div>
          <div class="set-scales">
            ${SCALES.map((sc) => `
              <button class="sc-pill${String(s.scale) === sc.value ? ' active' : ''}"
                data-testid="settings-scale" data-system-id="outer" data-window-id="${win.id}" data-value="${sc.value}"
                aria-label="界面缩放 ${sc.label}">
                ${sc.label}
              </button>
            `).join('')}
          </div>
        </div>

        <div class="set-group">
          <div class="set-title">通知设置（与小组件快捷设置同步）</div>
          <label class="set-check"><input type="checkbox" class="set-dnd-chk" ${s.dnd ? 'checked' : ''}/> 开启免打扰模式</label>
        </div>
      </div>
    `;

    bodyEl.querySelector('.set-name-save').addEventListener('click', () => {
      const v = bodyEl.querySelector('.set-name-in').value.trim();
      if (v) {
        os.updateSettings({ systemName: v });
        render();
      }
    });

    bodyEl.querySelectorAll('.wp-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        os.updateSettings({ wallpaper: btn.dataset.value });
        render();
      });
    });

    bodyEl.querySelectorAll('.ac-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        os.updateSettings({ accent: btn.dataset.value });
        render();
      });
    });

    bodyEl.querySelectorAll('.sc-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        os.updateSettings({ scale: Number(btn.dataset.value) });
        render();
      });
    });

    bodyEl.querySelector('.set-dnd-chk').addEventListener('change', (e) => {
      os.updateSettings({ dnd: e.target.checked });
    });
  };

  render();
  return { destroy: () => {} };
}
