// 根系统应用登记与系统窗口 / 投送窗口 / 系统管理面板
import { mountFiles } from './files.js';
import { mountSheet } from './sheet.js';
import { mountWidgets } from './widgets.js';
import { mountEditor } from './editor.js';
import { mountTaskMgr } from './taskmgr.js';
import { mountSettings } from './settings.js';
import { mountBrowser } from './browser.js';
import { mountHelp } from './help.js';
import { mountConsole } from './console.js';
import { mountSystemView } from './systemview.js';
import { mountProjection } from './projection.js';
import { mountSysPanel } from './syspanel.js';

export const rootApps = {
  files: { title: '文件管理器', w: 760, h: 500, mount: mountFiles },
  sheet: { title: '电子表格', w: 860, h: 560, mount: mountSheet },
  widgets: { title: '小组件', w: 620, h: 460, mount: mountWidgets },
  editor: { title: '程序编辑器', w: 720, h: 520, mount: mountEditor },
  taskmgr: { title: '任务管理器', w: 820, h: 540, mount: mountTaskMgr },
  settings: { title: '设置', w: 520, h: 440, mount: mountSettings },
  browser: { title: '浏览器', w: 960, h: 620, mount: mountBrowser },
  help: { title: '操作说明', w: 760, h: 580, mount: mountHelp },
  console: { title: '程序控制台', w: 620, h: 440, mount: mountConsole },
  systemview: { title: '子系统', w: 640, h: 460, mount: mountSystemView },
  projection: { title: '投送窗口', w: 620, h: 440, mount: mountProjection },
  syspanel: { title: '系统管理', w: 780, h: 560, mount: mountSysPanel }
};
