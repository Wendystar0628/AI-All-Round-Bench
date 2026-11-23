export const glyphs={
 logo:'M3 15 12 5l9 10M6 18l6-7 6 7M9 21l3-3 3 3',
 files:'M3 8V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8h18',
 spreadsheet:'M4 4h16v16H4zM4 9h16M4 14h16M10 9v11M15 9v11',
 browser:'M4.5 16a8 8 0 0 1 0-8m1 10a8 8 0 0 0 13-10M7 6a8 8 0 0 1 10 0M3 13c4 2 12 2 18 0M12 4c-5 4-5 12 0 16m0-16c5 4 5 12 0 16',
 widgets:'M4 4h7v7H4zM14 4h6v7h-6zM4 14h7v6H4zM14 14h6v6h-6z',
 editor:'M5 3h10l4 4v14H5zM8 9h4M8 13h8M8 17h6M14 3v5h5',
 tasks:'M3 5h18v14H3zM5 13h4l2-5 2 8 2-4h4',
 settings:'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM10 3h4l1 3 3 1 3 2v4l-3 1-1 3-2 4h-4l-1-3-3-1-3-2v-4l3-1 1-3z',
 help:'M4 4h16v16H4zM9 9a3 3 0 1 1 4 3l-1 1v1m0 3v.1',
 system:'m12 3 9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 16l9 5 9-5',
 player:'M3 5h18v14H3zM10 8l6 4-6 4z',
 charts:'M4 3v17h17M8 16v-4m5 4V7m5 9v-6',
 projection:'M3 5h18v14H3zM9 17l7-7m-6 0h6v6',
 bell:'M5 17h14l-2-4V9a5 5 0 0 0-10 0v4l-2 4zm5 3h4',
 wifi:'M3 9a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0m-9 3a5 5 0 0 1 6 0m-3 4v.1',
 plus:'M12 5v14M5 12h14', back:'M19 12H5m6-6-6 6 6 6', next:'M5 12h14m-6-6 6 6-6 6',
 close:'m6 6 12 12M18 6 6 18', min:'M5 14h14', max:'M6 6h12v12H6z', restore:'M5 8h11v11H5zM8 5h11v11',
 check:'m5 12 4 4 10-10', play:'m8 5 12 7-12 7z', pause:'M9 6v12M15 6v12', stop:'M7 7h10v10H7z',
 loop:'M4 11V8h14l-3-3m4 8v3H5l3 3', tree:'M5 4v10m0-5h9m-9 5h9m0-7h5v4h-5zm0 5h5v4h-5z',
 search:'M10 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm5 11 5 5', trash:'M4 7h16M9 4h6m3 3-1 13H7L6 7m4 3v6m4-6v6',
 reload:'M19 8a8 8 0 1 0 1 7m0-11v5h-5', terminal:'M3 5h18v14H3zM7 9l3 3-3 3m5 0h5'
};
export const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const ico=(name,cls='')=>'<svg class="icon '+cls+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(glyphs[name]??glyphs.files)+'"/></svg>';
export const appInfo={
 systems:['系统树','system','#ffc28d'],system:['子系统','system','#ffc28d'],files:['文件管理器','files','#ffd0a1'],spreadsheet:['电子表格','spreadsheet','#a8e1c7'],browser:['浏览器','browser','#a3d8ea'],widgets:['小组件','widgets','#f4c1ba'],editor:['文本与程序','editor','#d1c6ff'],tasks:['进程管理器','tasks','#b4e1d8'],settings:['系统设置','settings','#dae1e8'],help:['操作说明','help','#eed3a9'],player:['场景播放器','player','#efbb9d'],charts:['图表工作台','charts','#a5dfcc'],projection:['跨层投送','projection','#afdfdb'],canvas:['程序画布','terminal','#ccd2ff']};
export function badge(app,small=false){const [_,i,color]=appInfo[app]??appInfo.files;return '<span class="app-icon '+(small?'mini':'')+'" style="--icon-color:'+color+'">'+ico(i)+'</span>';}
export const attrs=(id='',extra={})=>(id?' data-testid="'+id+'"':'')+Object.entries(extra).map(([k,v])=>' '+k+'="'+esc(v)+'"').join('');
export const btn=(label,fnId='',opts={})=>'<button type="button"'+attrs(fnId,opts.attrs)+' class="'+(opts.cls??'')+'" aria-label="'+esc(opts.label??label)+'" title="'+esc(opts.label??label)+'">'+(opts.icon?ico(opts.icon):'')+(opts.only?'':esc(label))+'</button>';
export const select=(id,values,value,extra={})=>'<select'+attrs(id,extra)+' aria-label="'+esc(extra.title??id)+'">'+values.map(v=>{const [k,l]=Array.isArray(v)?v:[v,v];return '<option data-value="'+esc(k)+'" value="'+esc(k)+'"'+(String(k)===String(value)?' selected':'')+'>'+esc(l)+'</option>';}).join('')+'</select>';
export function el(tag,cls='',html=''){const n=document.createElement(tag);n.className=cls;n.innerHTML=html;return n;}
export const get=(e,id)=>e.querySelector('[data-testid="'+id+'"]');
export const on=(e,id,fn,type='click')=>get(e,id)?.addEventListener(type,fn);
export const set=(e,id,fn)=>on(e,id,ev=>fn(ev.target.value,ev),'change');
export function stamp(e,sid,wid){for(const n of [e,...e.querySelectorAll('[data-testid]')])if(!n.dataset.systemId){n.dataset.systemId=sid;if(wid)n.dataset.windowId=wid;}}
export const num=(n,d=0)=>Number(n??0).toFixed(d);
export const fmtBytes=n=>n<1024?n+' B':n<1024**2?(n/1024).toFixed(1)+' KB':(n/1024**2).toFixed(2)+' MB';
