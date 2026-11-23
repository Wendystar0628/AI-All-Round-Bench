const program=(name,vars,input=false)=>JSON.stringify({name,code:[...Object.entries(vars).map(([to,value])=>({op:'set',to,value})),...(input?[{op:'receive',to:'event'},{op:'accept',value:'$event'},{op:'jump',target:Object.keys(vars).length}]:[{op:'wait',seconds:.5},{op:'jump',target:Object.keys(vars).length}])]},null,2);
export const APP_PROGRAMS={
 '/System/window-manager.os':program('窗口管理服务',{stack:'front',focus:'click'},true),
 '/System/files-app.os':program('文件管理服务',{order:'ascending',writable:true},true),
 '/System/chart-app.os':program('图表规则服务',{factor:1},true),
 '/System/player-app.os':program('播放器规则服务',{rateScale:1},true)
};
export const APP_PATHS={wm:'/System/window-manager.os',files:'/System/files-app.os',charts:'/System/chart-app.os',player:'/System/player-app.os'};
export function appProcess(sys,role){let pid=sys.appPids?.[role];return sys.vm?.processes.find(p=>p.pid===pid)}
export function appReady(sys,role){if(!sys.parentId)return true;let p=appProcess(sys,role);return !!p&&!['suspended','ended','error'].includes(p.state)}
export function appRule(sys,role,key,fallback){let p=appProcess(sys,role);return p&&Object.hasOwn(p.vars,key)?p.vars[key]:fallback}

export function processReady(sys,pid,role){if(!sys.parentId)return true;let p=pid?sys.vm?.processes.find(x=>x.pid===pid):appProcess(sys,role);return !!p&&!['suspended','ended','error'].includes(p.state)}
export function processRule(sys,pid,role,key,fallback){let p=pid?sys.vm?.processes.find(x=>x.pid===pid):appProcess(sys,role);return p&&Object.hasOwn(p.vars,key)?p.vars[key]:fallback}
