import fs from 'fs';
let s = fs.readFileSync('css/style.css', 'utf8');
const a = `.resize-handle { position: absolute; z-index: 40; }
.rh-n { top: -3px; left: 8px; right: 8px; height: 7px; cursor: ns-resize; }
.rh-s { bottom: -3px; left: 8px; right: 8px; height: 7px; cursor: ns-resize; }
.rh-e { right: -3px; top: 8px; bottom: 8px; width: 7px; cursor: ew-resize; }
.rh-w { left: -3px; top: 8px; bottom: 8px; width: 7px; cursor: ew-resize; }
.rh-ne { right: -3px; top: -3px; width: 12px; height: 12px; cursor: nesw-resize; }
.rh-nw { left: -3px; top: -3px; width: 12px; height: 12px; cursor: nwse-resize; }
.rh-se { right: -3px; bottom: -3px; width: 12px; height: 12px; cursor: nwse-resize; }
.rh-sw { left: -3px; bottom: -3px; width: 12px; height: 12px; cursor: nesw-resize; }`;
const b = `.resize-handle { position: absolute; z-index: 45; }
.rh-n { top: 0; left: 8px; right: 8px; height: 5px; cursor: ns-resize; }
.rh-s { bottom: 0; left: 8px; right: 8px; height: 5px; cursor: ns-resize; }
.rh-e { right: 0; top: 8px; bottom: 8px; width: 5px; cursor: ew-resize; }
.rh-w { left: 0; top: 8px; bottom: 8px; width: 5px; cursor: ew-resize; }
.rh-ne { right: 0; top: 0; width: 12px; height: 12px; cursor: nesw-resize; }
.rh-nw { left: 0; top: 0; width: 12px; height: 12px; cursor: nwse-resize; }
.rh-se { right: 0; bottom: 0; width: 14px; height: 14px; cursor: nwse-resize; }
.rh-sw { left: 0; bottom: 0; width: 12px; height: 12px; cursor: nesw-resize; }`;
if (s.includes(a)) { s = s.replace(a, b); console.log('ok'); } else console.log('miss');
fs.writeFileSync('css/style.css', s);