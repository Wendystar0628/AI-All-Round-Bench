import fs from 'fs';
let s = fs.readFileSync('js/data.js', 'utf8');
const a = `export const INNER_FILES = {
  '/Documents/welcome.txt': '这是子系统文档目录。\\n\\n子系统拥有独立的文件系统、进程表、虚拟时钟和桌面。\\n',`;
const b = `export const INNER_FILES = {
  '/Documents/welcome.txt': '这是子系统文档目录。\\n\\n子系统拥有独立的文件系统、进程表、虚拟时钟和桌面。\\n',
  '/Demo/add.prog': ADD_PROGRAM,
  '/Demo/loop.prog': LOOP_PROGRAM,
  '/Demo/sender.prog': SENDER_PROGRAM,
  '/Demo/receiver.prog': RECEIVER_PROGRAM,
  '/Demo/service.prog': SERVICE_PROGRAM,
  '/Demo/draw.prog': DRAW_PROGRAM,`;
if (s.includes(a)) { s = s.replace(a, b); console.log('ok'); } else console.log('miss');
fs.writeFileSync('js/data.js', s);