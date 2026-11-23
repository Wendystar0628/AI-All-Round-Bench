// The project repository link (GitHub mark + label) and the Bilibili video collection link (TV mark + label),
// shared by the home fields line and the leaderboard head:
//   repoLink()   -> <a class="repo-link" href=REPO target=_blank>
//   videosLink() -> <a class="repo-link" href=VIDEOS target=_blank>
import { h, svg } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { REPO, VIDEOS } from '../core/route.js';

// GitHub mark (Octicons mark-github, 16×16)
const MARK = 'M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z';

export function repoLink() {
  const mark = svg('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': 'true', class: 'repo-mark' });
  mark.append(svg('path', { d: MARK, fill: 'currentColor' }));
  return h('a.repo-link', { href: REPO, target: '_blank', rel: 'noopener noreferrer' }, mark, h('span', t('common.repo')));
}

// A TV with two antennae (the shape Bilibili's mark is built on), drawn as a 16×16 stroke icon
export function videosLink() {
  const mark = svg('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': 'true', class: 'repo-mark' });
  const line = { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  mark.append(
    svg('path', { d: 'M4.6 1.6 6.6 3.8M11.4 1.6 9.4 3.8', ...line }),
    svg('rect', { x: 1.3, y: 3.9, width: 13.4, height: 10.1, rx: 2.4, ...line }),
    svg('path', { d: 'M5.4 7.6v1.8M10.6 7.6v1.8', ...line }),
  );
  return h('a.repo-link', { href: VIDEOS, target: '_blank', rel: 'noopener noreferrer' }, mark, h('span', t('common.videos')));
}
