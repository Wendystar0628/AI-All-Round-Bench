// 公共入口：每页都要的交互。页面自己的脚本先 import 这个文件，再写自己的部分（见 home.js）。
import { initShell } from './shell.js';
import { initLightbox } from './lightbox.js';

initShell();
initLightbox();
