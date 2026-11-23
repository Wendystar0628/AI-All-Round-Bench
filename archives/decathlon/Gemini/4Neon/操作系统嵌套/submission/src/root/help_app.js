// Root Simplified Chinese Manual / Help Viewer ('help')

import { HELP_MANUAL_SECTIONS } from '../fixtures/docs_content.js';

export function mountRootHelpApp(os, win, bodyEl) {
  let activeId = HELP_MANUAL_SECTIONS[0].id;

  const render = () => {
    const cur = HELP_MANUAL_SECTIONS.find((s) => s.id === activeId) || HELP_MANUAL_SECTIONS[0];
    bodyEl.innerHTML = `
      <div class="help-shell">
        <div class="help-nav">
          ${HELP_MANUAL_SECTIONS.map((s) => `
            <button class="help-nav-btn${s.id === cur.id ? ' active' : ''}" data-hid="${s.id}">${s.title}</button>
          `).join('')}
        </div>
        <div class="help-content">
          <h2>${cur.title}</h2>
          <pre class="help-pre">${cur.body.replace(/</g, '&lt;')}</pre>
        </div>
      </div>
    `;
    bodyEl.querySelectorAll('.help-nav-btn').forEach((b) => {
      b.addEventListener('click', () => {
        activeId = b.dataset.hid;
        render();
      });
    });
  };

  render();
  return { destroy: () => {} };
}
