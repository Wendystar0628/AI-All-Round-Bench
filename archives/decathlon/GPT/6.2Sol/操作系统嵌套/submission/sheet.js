import {btn,esc,ico,on,get,stamp} from './ui.js';
import {readFile,writeFile,fileName,join,world} from './runtime.js';
export const colName=i=>{let s='';for(i++;i>0;i=Math.floor((i-1)/26))s=String.fromCharCode(65+(i-1)%26)+s;return s;};
const PAGE_WIDTH=24,PAGE_HEIGHT=48,MAX_WIDTH=18278,MAX_HEIGHT=9999;
const colIndex=x=>[...x].reduce((a,c)=>a*26+c.charCodeAt(0)-64,0)-1;
export function coords(s){const m=/^([A-Z]{1,3})([1-9]\d{0,3})$/.exec(String(s).toUpperCase());if(!m)throw Error('#REF!');return [colIndex(m[1]),+m[2]-1];}
export function rect(range){
 const parts=range.toUpperCase().trim().split(':').map(v=>v.trim());
 if(parts.length>2)throw Error('选区格式无效');
 const [aa,bb=aa]=parts,a=coords(aa),b=coords(bb);
 const x=Math.min(a[0],b[0]),y=Math.min(a[1],b[1]),w=Math.abs(a[0]-b[0])+1,h=Math.abs(a[1]-b[1])+1;
 if(w*h>20000)throw Error('区域过大');return {x,y,w,h};
}
const addr=(x,y)=>colName(x)+(y+1);
const matrix=(r,fn)=>Array.from({length:r.h},(_,i)=>Array.from({length:r.w},(_,j)=>fn(addr(r.x+j,r.y+i))));
export function calculate(cells){
 const cache=Object.create(null),busy=new Set();
 function cell(id) {
   if(Object.hasOwn(cache,id))return cache[id];
   if(busy.has(id))throw Error('#CYCLE!');
   if(!Object.hasOwn(cells,id))return '';
   const raw=String(cells[id]);
   if(!raw.startsWith('='))return cache[id]=raw.trim()!==''&&Number.isFinite(Number(raw))?Number(raw):raw;
   busy.add(id);let result;
   try{result=formula(raw.slice(1),cell);}catch(err){result=String(err.message).startsWith('#')?err.message:'#VALUE!';}
   busy.delete(id);return cache[id]=result;
 }
 Object.keys(cells).forEach(cell);return cache;
}
function formula(raw,cell){
 const lex=/\s*(?:(\d+(?:\.\d*)?|\.\d+)|([A-Z]+\d+|[A-Z]+)|([-+*/():,]))/iy, tokens=[];
 for(let p=0;p<raw.trimEnd().length;){lex.lastIndex=p;const m=lex.exec(raw);if(!m)throw Error('#VALUE!');p=lex.lastIndex;tokens.push(m[1]!==undefined?+m[1]:(m[2]??m[3]).toUpperCase());}
 let pos=0;
 const take=()=>tokens[pos++], peek=()=>tokens[pos], expect=x=>{if(take()!==x)throw Error('#VALUE!');};
 const numeric=x=>{if(typeof x==='string'&&x.startsWith('#'))throw Error(x);if(typeof x==='string'&&x!=='')throw Error('#VALUE!');return +x;};
 function atom(){
   const t=take();if(typeof t==='number')return t;
   if(t==='-')return -atom();if(t==='+')return atom();
   if(t==='('){const n=expr();expect(')');return n;}
   if(t==='SUM'){
     expect('(');let total=0;
     if(peek()===')'){take();return 0;}
     do{
       if(tokens[pos+1]===':'){
         const a=take();take();const b=take();
         const r=rect(a+':'+b);matrix(r,x=>{const value=cell(x);if(typeof value==='number')total+=value;else if(value.startsWith('#'))throw Error(value);});
       }else total+=expr();
       if(peek()!==',')break;
       take();
     }while(true);
     expect(')');return total;
   }
   if(typeof t==='string'&&/^[A-Z]+\d+$/.test(t)){coords(t);return numeric(cell(t));}
   throw Error('#REF!');
 }
 function term(){let n=atom();while(peek()==='*'||peek()==='/'){const op=take(),v=atom();if(op==='/'&&v===0)throw Error('#DIV/0!');n=op==='*'?n*v:n/v;}return n;}
 function expr(){let n=term();while(peek()==='+'||peek()==='-'){const op=take(),v=term();n=op==='+'?n+v:n-v;}return n;}
 const n=expr();if(pos!==tokens.length||!Number.isFinite(n))throw Error('#VALUE!');return n;
}
export function setupBook(s,w,path){
 const d=w.data;let model={cells:{},format:{}};
 if(path)model=JSON.parse(readFile(s,path));
 if(!model||typeof model!=='object'||Array.isArray(model))throw Error('工作簿格式无效');
 const cells=Object.create(null),format=Object.create(null);
 for(const [key,value] of Object.entries(model.cells??{})){
   const address=key.toUpperCase();coords(address);
   if(typeof value!=='string'&&typeof value!=='number')throw Error('单元格 '+address+' 不是文本或数值');
   cells[address]=value;
 }
 for(const [key,value] of Object.entries(model.format??{})){
   const address=key.toUpperCase();coords(address);
   if(value==='header')format[address]=value;
 }
 Object.assign(d,{path:path??'/Documents/未命名.sheet',identity:'book-'+(++world.docSerial),version:1,cells,format,selection:'A1',anchor:'A1',viewX:0,viewY:0,undo:[],redo:[],dirty:false});
 d.values=calculate(d.cells);
}
export function region(d,range){return matrix(rect(range),id=>d.values[id]??'');}
function selected(d){return rect(d.anchor+':'+d.selection);}
export const bookTitle=d=>fileName(d.path);
export function saveBook(s,w,path,api){
 const d=w.data;
 path=path.trim();if(!path.startsWith('/'))path=join('/Documents',path);if(!path.endsWith('.sheet'))path+='.sheet';
 writeFile(s,path,JSON.stringify({version:1,cells:d.cells,format:d.format},null,2));d.path=path;d.dirty=false;api.notify(s,'已保存 '+bookTitle(d));api.refreshFiles(s);api.update();
}
export function mountSheet(s,w,e,api){
 const d=w.data;if(!d.cells)setupBook(s,w,w.data.path);
 let usedRows=18,usedCols=12;
 for(const key of Object.keys(d.cells)){
   try{const [x,y]=coords(key);usedRows=Math.max(usedRows,y+3);usedCols=Math.max(usedCols,x+2);}catch{}
 }
 const x0=d.viewX??0,y0=d.viewY??0;
 const paged=usedRows*usedCols>2000||d.viewFull||x0>0||y0>0;
 const cols=Math.min(paged?PAGE_WIDTH:usedCols,MAX_WIDTH-x0);
 const max=Math.min(paged?PAGE_HEIGHT:usedRows,MAX_HEIGHT-y0);
 const iconBtn=(label,id,i)=>btn(label,id,{icon:i,only:true});
 e.innerHTML='<div class="sheet-app app-column">'+
 '<div class="sheet-title"><div class="sheet-symbol">'+ico('spreadsheet')+'</div><div><input data-testid="sheet-filename" aria-label="工作簿路径" value="'+esc(d.path)+'"><div class="sheet-document"></div></div><div class="sheet-title-actions">'+btn('新建','sheet-new')+btn('打开','sheet-open')+btn('保存','sheet-save',{cls:'primary'})+'</div></div>'+
 '<div class="toolbar sheet-tools">'+iconBtn('撤销','sheet-undo','back')+iconBtn('重做','sheet-redo','next')+btn('复制结果','sheet-copy')+btn('粘贴','sheet-paste')+btn('标题样式','sheet-format')+'<span class="toolbar-divider"></span><input class="sheet-address" data-testid="sheet-address" aria-label="转到单元格" value="A1" title="输入单元格地址后按 Enter"><span class="fx">ƒx</span><input data-testid="sheet-formula" aria-label="单元格公式"></div>'+
 '<div class="sheet-scroll"><table class="sheet-grid" data-testid="sheet-grid" aria-label="工作表"><thead><tr><th></th>'+Array.from({length:cols},(_,x)=>'<th>'+colName(x+x0)+'</th>').join('')+'</tr></thead><tbody>'+
 Array.from({length:max},(_,y)=>'<tr><th>'+(y+y0+1)+'</th>'+Array.from({length:cols},(_,x)=>{const key=addr(x+x0,y+y0);return '<td><input type="text" spellcheck="false" autocomplete="off" data-testid="sheet-cell" data-cell-address="'+key+'" aria-label="'+key+'"></td>';}).join('')+'</tr>').join('')+
 '</tbody></table></div><footer class="status-line"><span class="sheet-state"></span><span class="sheet-area"></span></footer></div>';
 stamp(e,s.id,w.id);
 const addressInput=get(e,'sheet-address'),formulaInput=get(e,'sheet-formula'),filename=get(e,'sheet-filename'),grid=get(e,'sheet-grid');
 const inputs=new Map([...grid.querySelectorAll('input')].map(n=>[n.dataset.cellAddress,n]));
 let editing=null,dragging=false,formulaDirty=false,formulaTarget=null;
 function draw(){
   const r=selected(d);
   for(const [key,n] of inputs){
     const [x,y]=coords(key),value=d.values[key]??'';
     n.classList.toggle('selected',x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h);
     n.classList.toggle('cell-active',key===d.selection);n.classList.toggle('header-cell',d.format[key]==='header');
     n.classList.toggle('cell-error',typeof value==='string'&&value.startsWith('#'));n.classList.toggle('number',typeof value==='number');
     if(editing!==key)n.value=value;
   }
   if(!formulaDirty)formulaInput.value=d.cells[d.selection]??'';
   e.querySelector('.sheet-document').textContent=bookTitle(d)+(d.dirty?'  ·  ● 未保存':'  ·  工作表 1');
   if(document.activeElement!==addressInput)addressInput.value=d.selection;
   e.querySelector('.sheet-state').textContent='工作表 1 · 版本 '+d.version+(d.pendingRecalc?' · 正在重算':'');
   const vals=matrix(r,key=>d.values[key]).flat().filter(x=>typeof x==='number');
   e.querySelector('.sheet-area').textContent=r.w*r.h+' 个单元格'+(vals.length?' · 合计 '+vals.reduce((a,b)=>a+b,0):'');
 }
 function publish(){
   d.dirty=true;
   try{api.recalc(s,w);}catch(err){api.notify(s,err.message,'error');}
   api.update();draw();
 }
 function mutate(updater){
   d.undo.push({cells:{...d.cells},format:{...d.format}});if(d.undo.length>30)d.undo.shift();
   d.redo.length=0;updater();publish();
 }
 function history(from,to){
   const before=d[from].pop();if(!before)return;
   d[to].push({cells:{...d.cells},format:{...d.format}});Object.assign(d,before);publish();
 }
 function commit(key,value){
   if(String(d.cells[key]??'')===value){draw();return;}
   mutate(()=>{if(value==='')delete d.cells[key];else d.cells[key]=value;});
 }
 function selectCell(key,extend=false,focus=false){
   let x,y;
   try{
     [x,y]=coords(key);
     if(extend)rect(d.anchor+':'+key);
   }catch(err){api.notify(s,err.message==='区域过大'?'选区超过 20000 格':'请输入有效地址，例 A1 或 AA40','error');return;}
   if(formulaDirty)commitFormula();
   if(!extend)d.anchor=key;
   d.selection=key;
   if(!inputs.has(key)){
     d.viewX=Math.floor(x/PAGE_WIDTH)*PAGE_WIDTH;
     d.viewY=Math.floor(y/PAGE_HEIGHT)*PAGE_HEIGHT;
     if(d.viewX===0&&d.viewY===0)d.viewFull=true;
     api.remount(s,w);
     if(focus)e.querySelector('[data-cell-address="'+key+'"]')?.focus();
     return;
   }
   draw();
   if(focus)inputs.get(key)?.focus();
 }
 async function copy(){
   if(editing)return;
   const value=matrix(selected(d),key=>d.values[key]??'').map(r=>r.join('\t')).join('\n');await api.copy(s,value);
 }
 function paste(text){
   if(typeof text!=='string')return;
   const [x,y]=coords(d.selection),rows=text.replace(/\r/g,'').replace(/\n$/,'').split('\n').map(line=>line.split('\t'));
   const widest=rows.reduce((n,row)=>Math.max(n,row.length),0);
   if(rows.length*widest>20000||x+widest>MAX_WIDTH||y+rows.length>MAX_HEIGHT){
     api.notify(s,'粘贴区域超过工作表可显示范围','error');return;
   }
   mutate(()=>rows.forEach((row,i)=>row.forEach((v,j)=>{
     const key=addr(x+j,y+i);
     if(v==='')delete d.cells[key];else d.cells[key]=v;
   })));
   if(!paged&&(x+widest>cols||y+rows.length>max)){
     const list=e.querySelector('.sheet-scroll'),left=list.scrollLeft,top=list.scrollTop;
     api.remount(s,w);
     const restored=e.querySelector('.sheet-scroll');restored.scrollLeft=left;restored.scrollTop=top;
   }
 }
 function finish(input,save=true){
   if(editing!==input.dataset.cellAddress)return;
   editing=null;if(save)commit(input.dataset.cellAddress,input.value);else draw();
 }
 for(const [key,input] of inputs){
   input.onpointerdown=ev=>{if(editing===key)return;dragging=true;selectCell(key,ev.shiftKey);};
   input.onpointerenter=ev=>{if(dragging&&ev.buttons===1&&!editing)selectCell(key,true);};
   input.onfocus=()=>{if(d.selection!==key)selectCell(key);};
   input.ondblclick=()=>{editing=key;input.value=d.cells[key]??'';input.select();};
   input.oninput=()=>{editing=key;};
   input.onblur=()=>finish(input);
   input.onchange=()=>finish(input);
   input.onkeydown=ev=>{
     if(ev.ctrlKey||ev.metaKey){
       const k=ev.key.toLowerCase();
       if(k==='c'&&!editing){ev.preventDefault();copy();}
       else if(k==='z'&&!editing){ev.preventDefault();history(ev.shiftKey?'redo':'undo',ev.shiftKey?'undo':'redo');}
       else if(k==='y'&&!editing){ev.preventDefault();history('redo','undo');}
       else if(k==='s'){ev.preventDefault();finish(input);save();}
       return;
     }
     const [x,y]=coords(key);
     if(ev.key==='Enter'||ev.key==='Tab'){
       ev.preventDefault();finish(input);selectCell(ev.key==='Enter'?addr(x,y+1):addr(Math.max(0,x+(ev.shiftKey?-1:1)),y),false,true);
     }else if(ev.key==='Escape'){finish(input,false);}
     else if(!editing&&ev.key.startsWith('Arrow')){
       ev.preventDefault();const deltas={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},[dx,dy]=deltas[ev.key];
       selectCell(addr(Math.max(0,x+dx),Math.max(0,y+dy)),ev.shiftKey,true);
     }else if(!editing&&(ev.key==='Delete'||ev.key==='Backspace')){
       ev.preventDefault();mutate(()=>matrix(selected(d),k=>delete d.cells[k]));
     }else if(!editing&&ev.key.length===1){editing=key;input.value='';}
   };
   input.onpaste=ev=>{if(!editing){ev.preventDefault();paste(ev.clipboardData.getData('text/plain'));}};
 }
 grid.onpointerup=()=>dragging=false;grid.onpointerleave=ev=>{if(!ev.buttons)dragging=false;};
 function commitFormula(){
   if(!formulaDirty)return;
   const target=formulaTarget??d.selection;
   formulaDirty=false;formulaTarget=null;
   commit(target,formulaInput.value);
 }
 addressInput.onkeydown=ev=>{
   if(ev.key!=='Enter')return;
   ev.preventDefault();
   selectCell(addressInput.value.trim().toUpperCase(),false,true);
 };
 addressInput.onblur=()=>{addressInput.value=d.selection;};
 formulaInput.oninput=()=>{if(!formulaDirty)formulaTarget=d.selection;formulaDirty=true;};
 formulaInput.onchange=commitFormula;
 formulaInput.onkeydown=ev=>{
   if(ev.key==='Enter'){ev.preventDefault();commitFormula();inputs.get(d.selection)?.focus();}
   if(ev.key==='Escape'){formulaDirty=false;formulaTarget=null;draw();}
 };
 function save(){try{saveBook(s,w,filename.value,api);draw();}catch(err){api.notify(s,err.message,'error');}}
 on(e,'sheet-save',save);on(e,'sheet-copy',copy);on(e,'sheet-paste',async()=>paste(await host.paste()));
 on(e,'sheet-undo',()=>history('undo','redo'));on(e,'sheet-redo',()=>history('redo','undo'));
 on(e,'sheet-format',()=>mutate(()=>matrix(selected(d),k=>{if(d.format[k])delete d.format[k];else d.format[k]='header';})));
 on(e,'sheet-new',async()=>{if(await api.replaceBook(s,w))api.open(s,'spreadsheet',{},true);});
 on(e,'sheet-open',()=>api.pick(s,'打开工作簿',path=>path.endsWith('.sheet'),p=>api.openFile(s,p)));
 e.refresh=draw;draw();
}
