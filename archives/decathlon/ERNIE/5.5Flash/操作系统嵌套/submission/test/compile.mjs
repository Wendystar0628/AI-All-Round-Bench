import * as d from '../js/data.js';
import { compile } from '../js/lang.js';
for (const [n, s] of [['kernel', d.KERNEL_TEMPLATE], ['ctrl', d.CONTROLLER_TEMPLATE], ['winman', d.WINMAN_TEMPLATE], ['loop', d.LOOP_PROGRAM], ['sender', d.SENDER_PROGRAM], ['receiver', d.RECEIVER_PROGRAM], ['service', d.SERVICE_PROGRAM], ['add', d.ADD_PROGRAM], ['draw', d.DRAW_PROGRAM]]) {
  try { const p = compile(s); console.log(n, 'ok', p.code.length); }
  catch (e) { console.log(n, 'ERR', e.message, 'line', e.line); }
}