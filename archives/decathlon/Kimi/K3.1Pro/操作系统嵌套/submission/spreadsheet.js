(function (N) {
  const colName = number => { let name = ''; while (number > 0) { number--; name = String.fromCharCode(65 + number % 26) + name; number = Math.floor(number / 26); } return name; };
  const colNumber = name => { let number = 0; for (const char of name.toUpperCase()) number = number * 26 + char.charCodeAt(0) - 64; return number; };
  const address = (col, row) => `${colName(col)}${row}`;
  const parseAddress = value => { const match = String(value).trim().match(/^\$?([A-Za-z]+)\$?(\d+)$/); if (!match) throw new Error('#REF!'); return { col: colNumber(match[1]), row: Number(match[2]) }; };
  function parseRange(range) {
    const parts = String(range || 'A1:D4').split(':'); const a = parseAddress(parts[0]); const b = parseAddress(parts[1] || parts[0]);
    return { start: a, end: b, minCol: Math.min(a.col,b.col), maxCol: Math.max(a.col,b.col), minRow: Math.min(a.row,b.row), maxRow: Math.max(a.row,b.row) };
  }
  Object.assign(N, { colName, colNumber, cellAddress: address, parseRange });

  class FormulaParser {
    constructor(engine, source) { this.engine = engine; this.tokens = this.tokenize(source); this.index = 0; this.stack = []; }
    tokenize(source) {
      const tokens = []; let i = 0;
      while (i < source.length) {
        const c = source[i]; if (/\s/.test(c)) { i++; continue; }
        const number = source.slice(i).match(/^(?:\d+\.?\d*|\.\d+)/); if (number) { tokens.push({type:'number',value:Number(number[0])});i+=number[0].length;continue; }
        const reference = source.slice(i).match(/^\$?[A-Za-z]+\$?\d+/); if (reference) { tokens.push({type:'ref',value:reference[0].toUpperCase()});i+=reference[0].length;continue; }
        const name = source.slice(i).match(/^[A-Za-z]+/); if (name) { tokens.push({type:'name',value:name[0].toUpperCase()});i+=name[0].length;continue; }
        if (c === '"' || c === "'") { const q=c;let value='';i++;while(i<source.length&&source[i]!==q)value+=source[i++];if(source[i]!==q)throw new Error('#VALUE!');i++;tokens.push({type:'string',value});continue; }
        if ('+-*/^(),:'.includes(c)) { tokens.push({type:c,value:c});i++;continue; }
        throw new Error('#NAME?');
      }
      return tokens;
    }
    peek(type) { return this.tokens[this.index]?.type === type; }
    take(type) { if (type && !this.peek(type)) throw new Error('#VALUE!'); return this.tokens[this.index++]; }
    parse() { const value=this.add();if(this.index<this.tokens.length)throw new Error('#VALUE!');return value; }
    add() { let value=this.mul();while(this.peek('+')||this.peek('-')){const op=this.take().type,right=this.mul();value=op==='+'?this.number(value)+this.number(right):this.number(value)-this.number(right);}return value; }
    mul() { let value=this.power();while(this.peek('*')||this.peek('/')){const op=this.take().type,right=this.power();if(op==='/'&&this.number(right)===0)throw new Error('#DIV/0!');value=op==='*'?this.number(value)*this.number(right):this.number(value)/this.number(right);}return value; }
    power(){let value=this.unary();while(this.peek('^')){this.take();value=Math.pow(this.number(value),this.number(this.unary()));}return value;}
    unary(){if(this.peek('-')){this.take();return-this.number(this.unary());}if(this.peek('+')){this.take();return this.number(this.unary());}return this.primary();}
    number(value){if(value==null||value==='')return 0;const n=Number(value);if(!Number.isFinite(n))throw new Error('#VALUE!');return n;}
    primary(){
      if(this.peek('(')){this.take();const value=this.add();this.take(')');return value;}
      if(this.peek('number')||this.peek('string'))return this.take().value;
      if(this.peek('ref')){const first=this.take().value;if(this.peek(':')){this.take();const second=this.take('ref').value;return this.engine.range(`${first}:${second}`);}return this.engine.value(first);}
      if(this.peek('name')){const name=this.take().value;this.take('(');const args=[];if(!this.peek(')')){do{if(this.peek('ref')){const save=this.index;const first=this.take().value;if(this.peek(':')){this.take();const second=this.take('ref').value;args.push(this.engine.range(`${first}:${second}`));}else{this.index=save;args.push(this.add());}}else args.push(this.add());if(!this.peek(','))break;}while(this.take(','));}this.take(')');if(name==='SUM')return args.flat(Infinity).reduce((sum,value)=>sum+this.number(value),0);throw new Error('#NAME?');}
      throw new Error('#VALUE!');
    }
  }

  class SheetEngine {
    constructor(document) { this.document=N.clone(document);this.cells=this.document.cells||{};this.cache={};this.visiting=new Set();this.revision=0; }
    raw(ref){return this.cells[ref]?.raw??'';}
    value(ref){
      ref=ref.replace(/\$/g,'').toUpperCase();if(this.cache[ref]!==undefined)return N.clone(this.cache[ref]);
      if(this.visiting.has(ref))throw new Error('#CYCLE!');this.visiting.add(ref);
      try{const raw=this.raw(ref);let value;if(typeof raw==='string'&&raw.startsWith('=')){value=new FormulaParser(this,raw.slice(1)).parse();}else if(raw==='')value='';else if(typeof raw==='number'||(typeof raw==='string'&&raw.trim()!==''&&!Number.isNaN(Number(raw))))value=Number(raw);else value=raw;this.cache[ref]=value;return N.clone(value);}catch(error){const code=Object.values(this.cells).some(cell=>String(cell.raw).includes(ref))&&error.message==='#CYCLE!'?'#CYCLE!':error.message;const result=['#DIV/0!','#REF!','#VALUE!','#NAME?','#CYCLE!'].includes(code)?code:'#VALUE!';this.cache[ref]=result;return result;}finally{this.visiting.delete(ref);}
    }
    range(range){const r=parseRange(range);const values=[];for(let row=r.minRow;row<=r.maxRow;row++)for(let col=r.minCol;col<=r.maxCol;col++){const value=this.value(address(col,row));if(Array.isArray(value))values.push(...value);else values.push(value);}return values;}
    matrix(range){const r=parseRange(range);const matrix=[];for(let row=r.minRow;row<=r.maxRow;row++){const line=[];for(let col=r.minCol;col<=r.maxCol;col++)line.push(this.value(address(col,row)));matrix.push(line);}return matrix;}
    set(ref,raw){this.cells[ref]={...(this.cells[ref]||{}),raw:String(raw)};this.revision++;this.cache={};}
    clear(ref){delete this.cells[ref];this.revision++;this.cache={};}
    serialize(){return {...N.clone(this.document),cells:N.clone(this.cells),format:'nexus-sheet-1'};}
  }
  N.SheetEngine=SheetEngine;

  class SheetController {
    constructor(os,system,window,content,document,path){
      this.os=os;this.system=system;this.window=window;this.content=content;this.path=path||null;
      this.engine=new SheetEngine(document||{format:'nexus-sheet-1',id:N.uid('workbook'),title:'新建工作簿',cells:{}});
      this.documentId=this.engine.document.id||(this.engine.document.id=N.uid('workbook'));this.title=this.engine.document.title||N.basename(path||'新建工作簿.sheet');
      this.selection={start:'A1',end:'A1'};this.anchor='A1';this.editing=null;this.dirty=false;this.undoStack=[];this.redoStack=[];this.dragging=false;
      this.render();this.register();
    }
    register(){this.os.workbooks.set(this.documentId,this);this.publish();}
    render(){
      this.content.innerHTML=`<div class="sheet-layout"><div class="app-toolbar"><button class="tool-button" data-action="new">新建</button><button class="tool-button" data-action="open">打开</button><button class="tool-button primary" data-testid="sheet-save" data-action="save">保存</button><span class="tool-separator"></span><button class="tool-button" data-action="undo" title="撤销">↶</button><button class="tool-button" data-action="redo" title="重做">↷</button><button class="tool-button" data-action="bold"><b>B</b></button><button class="tool-button" data-action="fill" title="填充色"><span style="color:#d4b5ff">▰</span></button><span class="toolbar-spacer"></span><span class="badge sheet-dirty">已保存</span></div><div class="sheet-formula-row"><span class="sheet-name-box">A1</span><span class="fx">fx</span><input class="sheet-formula" data-testid="sheet-formula" aria-label="公式编辑栏" placeholder="输入值或 =SUM(A1:A4)"><input class="sheet-filename" data-testid="sheet-filename" aria-label="工作簿名称" value=""></div><div class="sheet-scroll"><table class="sheet-grid" data-testid="sheet-grid"><thead></thead><tbody></tbody></table></div><div class="sheet-footer"><span class="sheet-summary">就绪</span><span>工作表 1</span><span>依赖重算 · 实时发布</span></div></div>`;
      this.content.querySelector('.sheet-filename').value=this.title;
      const cols=12,rows=36;let head='<tr><th class="corner"></th>';for(let c=1;c<=cols;c++)head+=`<th>${colName(c)}</th>`;head+='</tr>';this.content.querySelector('thead').innerHTML=head;
      let body='';for(let r=1;r<=rows;r++){body+=`<tr><th>${r}</th>`;for(let c=1;c<=cols;c++){const ref=address(c,r);body+=`<td class="sheet-cell" data-testid="sheet-cell" data-cell-address="${ref}" tabindex="0" aria-label="单元格 ${ref}"></td>`;}body+='</tr>';}this.content.querySelector('tbody').innerHTML=body;
      this.bind();this.refresh();
    }
    bind(){
      const table=this.content.querySelector('.sheet-grid');
      table.addEventListener('mousedown',event=>{const cell=event.target.closest('.sheet-cell');if(!cell)return;const ref=cell.dataset.cellAddress;if(event.shiftKey)this.selection.end=ref;else{this.anchor=ref;this.selection={start:ref,end:ref};this.dragging=true;}this.refreshSelection();event.preventDefault();cell.focus();});
      table.addEventListener('mouseover',event=>{if(!this.dragging)return;const cell=event.target.closest('.sheet-cell');if(cell){this.selection.end=cell.dataset.cellAddress;this.refreshSelection();}});
      window.addEventListener('mouseup',()=>this.dragging=false);
      table.addEventListener('dblclick',event=>{const cell=event.target.closest('.sheet-cell');if(cell)this.startEdit(cell.dataset.cellAddress);});
      table.addEventListener('keydown',event=>this.key(event));
      table.addEventListener('copy',event=>{event.preventDefault();this.copy(event.clipboardData);});
      table.addEventListener('paste',event=>{event.preventDefault();this.paste(event.clipboardData?.getData('text/plain')||this.os.clipboard[0]?.text||'');});
      this.content.querySelector('.sheet-formula').addEventListener('keydown',event=>{if(event.key==='Enter'){this.commit(this.selected(),event.target.value);event.preventDefault();this.content.querySelector(`[data-cell-address="${this.selected()}"]`)?.focus();}});
      this.content.querySelector('.sheet-filename').addEventListener('change',event=>{this.title=event.target.value;this.engine.document.title=this.title;this.markDirty();this.window.title=this.title;this.os.updateWindowChrome(this.window);});
      this.content.querySelector('.app-toolbar').addEventListener('click',event=>{const action=event.target.closest('[data-action]')?.dataset.action;if(!action)return;if(action==='save')this.save();else if(action==='new')this.os.confirmUnsaved(this,()=>this.os.openApp(this.system,'spreadsheet'));else if(action==='open')this.openDialog();else if(action==='undo')this.undo();else if(action==='redo')this.redo();else if(action==='bold')this.format('bold');else if(action==='fill')this.format('bg');});
    }
    selected(){return this.selection.start;}
    selectedRange(){const a=parseAddress(this.selection.start),b=parseAddress(this.selection.end);return `${address(Math.min(a.col,b.col),Math.min(a.row,b.row))}:${address(Math.max(a.col,b.col),Math.max(a.row,b.row))}`;}
    refresh(){
      this.content.querySelectorAll('.sheet-cell').forEach(cell=>{const ref=cell.dataset.cellAddress;const raw=this.engine.raw(ref);const value=this.engine.value(ref);cell.textContent=String(value??'');cell.title=raw;cell.classList.toggle('formula',String(raw).startsWith('='));cell.classList.toggle('error',String(value).startsWith('#'));cell.classList.toggle('bold',!!this.engine.cells[ref]?.bold);if(this.engine.cells[ref]?.bg)cell.style.background=this.engine.cells[ref].bg;else cell.style.background='';});
      this.refreshSelection();this.updateSummary();
    }
    refreshSelection(){
      const range=parseRange(this.selectedRange());this.content.querySelectorAll('.sheet-cell').forEach(cell=>{const p=parseAddress(cell.dataset.cellAddress);cell.classList.toggle('selected',p.col>=range.minCol&&p.col<=range.maxCol&&p.row>=range.minRow&&p.row<=range.maxRow);cell.classList.toggle('active',cell.dataset.cellAddress===this.selected());});
      this.content.querySelector('.sheet-name-box').textContent=this.selectedRange();const formula=this.content.querySelector('.sheet-formula');if(document.activeElement!==formula)formula.value=this.engine.raw(this.selected());
    }
    updateSummary(){const range=parseRange(this.selectedRange());const values=this.engine.matrix(this.selectedRange()).flat().filter(v=>typeof v==='number');this.content.querySelector('.sheet-summary').textContent=values.length?`求和 ${values.reduce((a,b)=>a+b,0)}　平均 ${(values.reduce((a,b)=>a+b,0)/values.length).toFixed(2)}　计数 ${values.length}`:'就绪';const badge=this.content.querySelector('.sheet-dirty');badge.textContent=this.dirty?'未保存':'已保存';badge.className=`badge sheet-dirty ${this.dirty?'warning':'success'}`;}
    startEdit(ref,initial){const cell=this.content.querySelector(`[data-cell-address="${ref}"]`);if(!cell)return;this.editing=ref;const input=document.createElement('input');input.className='cell-editor';input.value=initial??this.engine.raw(ref);cell.innerHTML='';cell.append(input);input.focus();input.select();const finish=cancel=>{if(this.editing!==ref)return;this.editing=null;if(!cancel)this.commit(ref,input.value);else this.refresh();};input.addEventListener('keydown',event=>{if(event.key==='Enter'){finish();const next=parseAddress(ref);const nextRef=address(next.col,Math.min(36,next.row+1));this.selection={start:nextRef,end:nextRef};this.refreshSelection();this.content.querySelector(`[data-cell-address="${nextRef}"]`)?.focus();event.preventDefault();}else if(event.key==='Escape'){finish(true);event.preventDefault();}else if(event.key==='Tab'){finish();event.preventDefault();}});input.addEventListener('blur',()=>finish());}
    key(event){
      if(this.editing)return;const ref=this.selected();const p=parseAddress(ref);
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='c'){event.preventDefault();this.copy();return;}
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='v'){event.preventDefault();if(navigator.clipboard?.readText)navigator.clipboard.readText().then(text=>this.paste(text)).catch(()=>this.paste(this.os.clipboard[0]?.text||''));else this.paste(this.os.clipboard[0]?.text||'');return;}
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();this.undo();return;}
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();this.redo();return;}
      if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();this.snapshot();const range=parseRange(this.selectedRange());for(let r=range.minRow;r<=range.maxRow;r++)for(let c=range.minCol;c<=range.maxCol;c++)this.engine.clear(address(c,r));this.afterChange();return;}
      const moves={ArrowDown:[0,1],ArrowUp:[0,-1],ArrowRight:[1,0],ArrowLeft:[-1,0],Enter:[0,event.shiftKey?-1:1],Tab:[event.shiftKey?-1:1,0]};
      if(moves[event.key]){event.preventDefault();const[dcol,drow]=moves[event.key];const next=address(N.clamp(p.col+dcol,1,12),N.clamp(p.row+drow,1,36));this.selection={start:next,end:next};this.anchor=next;this.refreshSelection();this.content.querySelector(`[data-cell-address="${next}"]`)?.focus();return;}
      if(event.key==='F2'){event.preventDefault();this.startEdit(ref);return;}
      if(event.key.length===1&&!event.ctrlKey&&!event.metaKey){event.preventDefault();this.startEdit(ref,event.key);}
    }
    commit(ref,value){if(String(this.engine.raw(ref))===String(value))return;this.snapshot();this.engine.set(ref,value);this.afterChange();}
    afterChange(){this.dirty=true;this.refresh();this.publish();this.os.saveSoon();}
    snapshot(){this.undoStack.push(N.clone(this.cells||this.engine.cells));this.cells=null;if(this.undoStack.length>60)this.undoStack.shift();this.redoStack=[];}
    undo(){if(!this.undoStack.length)return;this.redoStack.push(N.clone(this.engine.cells));this.engine.cells=this.undoStack.pop();this.engine.cache={};this.dirty=true;this.refresh();this.publish();}
    redo(){if(!this.redoStack.length)return;this.undoStack.push(N.clone(this.engine.cells));this.engine.cells=this.redoStack.pop();this.engine.cache={};this.dirty=true;this.refresh();this.publish();}
    markDirty(){this.dirty=true;this.updateSummary();this.publish();}
    format(type){this.snapshot();const range=parseRange(this.selectedRange());for(let r=range.minRow;r<=range.maxRow;r++)for(let c=range.minCol;c<=range.maxCol;c++){const ref=address(c,r),cell=this.engine.cells[ref]||(this.engine.cells[ref]={raw:''});if(type==='bold')cell.bold=!cell.bold;else cell.bg=cell.bg?'':'#3c3155';}this.afterChange();}
    copy(clipboardData){const values=this.engine.matrix(this.selectedRange());const text=values.map(row=>row.join('\t')).join('\n');if(clipboardData)clipboardData.setData('text/plain',text);else navigator.clipboard?.writeText(text).catch(()=>{});this.os.addClipboard(text,'电子表格');this.os.toast('已复制选区',this.selectedRange(),'success');}
    paste(text){if(!text)return;this.snapshot();const rows=text.replace(/\r/g,'').split('\n').map(row=>row.split('\t'));const start=parseAddress(this.selected());rows.forEach((row,ri)=>row.forEach((value,ci)=>{if(start.row+ri<=36&&start.col+ci<=12)this.engine.set(address(start.col+ci,start.row+ri),value);}));this.afterChange();}
    save(path){path=path||this.path||`/Documents/${this.title.replace(/\.sheet$/,'')}.sheet`;try{this.engine.document.title=this.title;this.system.fs.write(path,JSON.stringify(this.engine.serialize(),null,2));this.path=path;this.dirty=false;this.window.title=`${this.title} — ${N.basename(path)}`;this.os.updateWindowChrome(this.window);this.refresh();this.os.notify(this.system.id,'工作簿已保存',path,'success');this.os.saveSoon();return true;}catch(error){this.os.toast('保存失败',error.message,'error');return false;}}
    publish(){const data={documentId:this.documentId,title:this.title,path:this.path,engine:this.engine};this.os.publishWorkbook(data);}
    openDialog(){const files=this.system.fs.list('/Demo').concat(this.system.fs.list('/Documents')).filter(file=>file.name.endsWith('.sheet'));this.os.choose('打开工作簿',files.map(file=>({label:file.path,value:file.path})),value=>{if(!value)return;this.os.confirmUnsaved(this,()=>{const doc=JSON.parse(this.system.fs.read(value));this.engine=new SheetEngine(doc);this.documentId=doc.id;this.title=doc.title||N.basename(value);this.path=value;this.dirty=false;this.undoStack=[];this.redoStack=[];this.os.workbooks.delete(this.documentId);this.render();this.register();});});}
    close(){this.os.publishWorkbookClosed(this.documentId,this.title);this.os.workbooks.delete(this.documentId);}
  }
  N.SheetController=SheetController;

  const Chart={
    compute(rows,labelColumn,series){
      if(!rows?.length)return{labels:[],series:[],points:0,max:1};const labelIndex=Math.max(0,colNumber(labelColumn)-1);const headers=rows[0]||[];
      const used=series.map(col=>Math.max(0,colNumber(col)-1));const labels=rows.slice(1).map(row=>String(row[labelIndex]??''));
      const datasets=used.map((column,index)=>({name:String(headers[column]||colName(column)),column:colName(column+1),color:['#ad8cff','#65d8cc','#f2bf63','#ed7e9b'][index%4],values:rows.slice(1).map(row=>{const value=Number(row[column]);return Number.isFinite(value)?value:0;})}));
      const max=Math.max(1,...datasets.flatMap(set=>set.values.map(value=>Math.abs(value))));return{labels,series:datasets,points:labels.length*datasets.length,max};
    },
    render(app,container){
      const width=Math.max(320,container.clientWidth-24),height=Math.max(180,container.clientHeight-16);const model=app.model||{labels:[],series:[],max:1};const margin={left:48,right:18,top:42,bottom:43};const pw=width-margin.left-margin.right,ph=height-margin.top-margin.bottom;const ns='http://www.w3.org/2000/svg';
      let svg=`<svg class="chart-canvas" viewBox="0 0 ${width} ${height}" role="img" aria-label="实时数据图表"><defs><linearGradient id="chartArea" x2="0" y2="1"><stop stop-color="#a98bff" stop-opacity=".12"/><stop offset="1" stop-color="#a98bff" stop-opacity="0"/></linearGradient></defs><text x="${margin.left}" y="20" fill="#ddd6ec" font-size="12" font-weight="500">${N.escapeHTML?.(app.sourceTitle||'实时数据')||app.sourceTitle||'实时数据'} · ${app.chartType==='line'?'折线趋势':'分组柱状'}</text><text x="${width-15}" y="19" text-anchor="end" fill="#787185" font-size="8">版本 ${app.processedVersion||0}</text>`;
      for(let i=0;i<=4;i++){const y=margin.top+ph*i/4,value=model.max*(1-i/4);svg+=`<line x1="${margin.left}" y1="${y}" x2="${width-margin.right}" y2="${y}" stroke="#ffffff" stroke-opacity=".09"/><text x="${margin.left-8}" y="${y+3}" text-anchor="end" fill="#817a90" font-size="8">${Math.round(value*10)/10}</text>`;}
      svg+=`<line x1="${margin.left}" y1="${margin.top+ph}" x2="${width-margin.right}" y2="${margin.top+ph}" stroke="#ffffff" stroke-opacity=".2"/>`;
      if(!model.labels.length){svg+='</svg>';container.innerHTML=svg;return;}
      const groupWidth=pw/model.labels.length;
      model.labels.forEach((label,i)=>{const x=margin.left+groupWidth*(i+.5);svg+=`<text x="${x}" y="${height-19}" text-anchor="middle" fill="#aaa2b6" font-size="9">${String(label).replace(/[<>&]/g,'')}</text>`;});
      model.series.forEach((set,si)=>{
        const legendX=margin.left+si*100;svg+=`<rect x="${legendX}" y="29" width="8" height="3" rx="1" fill="${set.color}"/><text x="${legendX+12}" y="34" fill="#8f879e" font-size="8">${set.name}</text>`;
        if(app.chartType==='line'){
          const points=set.values.map((value,i)=>({x:margin.left+groupWidth*(i+.5),y:margin.top+ph-(value/model.max)*ph,value}));const path=points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ');svg+=`<path d="${path}" fill="none" stroke="${set.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
          if(si===0&&points.length){const area=`${path} L${points[points.length-1].x},${margin.top+ph} L${points[0].x},${margin.top+ph}Z`;svg+=`<path d="${area}" fill="url(#chartArea)"/>`;}
          points.forEach((p,i)=>{svg+=`<g class="chart-value" data-chart-label="${model.labels[i]}" data-chart-value="${p.value}" data-chart-series="${set.name}"><circle cx="${p.x}" cy="${p.y}" r="8" fill="transparent"/><circle cx="${p.x}" cy="${p.y}" r="3" fill="#1b1827" stroke="${set.color}" stroke-width="2"/><text x="${p.x}" y="${p.y-9}" text-anchor="middle" fill="#d4cddf" font-size="8">${p.value}</text></g>`;});
        }else{
          const barWidth=Math.min(32,groupWidth/(model.series.length+1));set.values.forEach((value,i)=>{const h=Math.max(1,(value/model.max)*ph),x=margin.left+groupWidth*i+groupWidth*.5+(si-(model.series.length)/2)*barWidth,y=margin.top+ph-h;svg+=`<g class="chart-value" data-chart-label="${model.labels[i]}" data-chart-value="${value}" data-chart-series="${set.name}"><rect x="${x}" y="${y}" width="${Math.max(3,barWidth-3)}" height="${h}" rx="3" fill="${set.color}" fill-opacity=".82"/><rect x="${x}" y="${y}" width="${Math.max(3,barWidth-3)}" height="2" rx="1" fill="#fff" fill-opacity=".28"/><text x="${x+(barWidth-3)/2}" y="${y-5}" text-anchor="middle" fill="#c9c2d6" font-size="8">${value}</text></g>`;});
        }
      });container.innerHTML=svg+'</svg>';
      const tooltip=document.createElement('div');tooltip.className='chart-tooltip';tooltip.style.display='none';container.append(tooltip);container.querySelectorAll('.chart-value').forEach(element=>{element.addEventListener('mousemove',event=>{const r=container.getBoundingClientRect();tooltip.style.display='block';tooltip.style.left=`${event.clientX-r.left+12}px`;tooltip.style.top=`${event.clientY-r.top+10}px`;tooltip.innerHTML=`<b>${element.dataset.chartLabel}</b><br>${element.dataset.chartSeries}：${element.dataset.chartValue}`;});element.addEventListener('mouseleave',()=>tooltip.style.display='none');element.addEventListener('click',()=>{app.selectedPoint={label:element.dataset.chartLabel,value:Number(element.dataset.chartValue),series:element.dataset.chartSeries};});});
    }
  };
  N.Chart=Chart;
})(window.Nexus);
