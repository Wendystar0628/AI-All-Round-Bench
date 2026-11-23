import { OS } from './shell.js';

const os = new OS(document.getElementById('os-root'));
window.__os = os;
window.__nestedOS = os;

os.boot().catch(err => {
  console.error('boot failed', err);
  const boot = document.getElementById('boot-screen');
  if (boot) {
    boot.innerHTML = `<div class="boot-mark"><div class="boot-title" style="color:#ff9aa3">启动失败</div><div class="boot-sub" style="letter-spacing:0;max-width:600px">${String(err && err.message || err)}</div></div>`;
  }
});