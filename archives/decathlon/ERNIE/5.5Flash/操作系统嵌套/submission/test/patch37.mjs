import fs from 'fs';
let s = fs.readFileSync('js/data.js', 'utf8');
const a = `  '/System/kernel.sys': KERNEL_TEMPLATE,
  '/System/controller.prog': CONTROLLER_TEMPLATE,
  '/System/compiler.prog': COMPILER_TEMPLATE
};`;
const b = `  '/System/kernel.sys': KERNEL_TEMPLATE,
  '/System/controller.prog': CONTROLLER_TEMPLATE,
  '/System/compiler.prog': COMPILER_TEMPLATE,
  '/System/winman.prog': WINMAN_TEMPLATE,
  '/System/files.prog': FILES_TEMPLATE,
  '/System/player.prog': PLAYER_TEMPLATE,
  '/System/charts.prog': CHARTS_TEMPLATE,
  '/System/flight.prog': FLIGHT_TEMPLATE
};`;
if (s.includes(a)) { s = s.replace(a, b); console.log('ok'); } else console.log('miss');
fs.writeFileSync('js/data.js', s);