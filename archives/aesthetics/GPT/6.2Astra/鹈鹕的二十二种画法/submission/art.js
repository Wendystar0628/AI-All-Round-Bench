const CN=['红黑拼贴风','星际列车风','奇幻冒险金饰风','清爽蓝白校园风','Galgame 美术风','萌系 Q 版','偶像音游风','日系赛璐珞动画','现代数码动画','复古神秘学印刷风','工业机能风','蓝图工程绘图','水墨国风','浮世绘','剪纸艺术','印象派','波普艺术','街头涂鸦','像素艺术','赛博朋克','蒸汽波','故障艺术'];
const EN=['Red-Black Collage','Interstellar Railway','Fantasy Adventure','Bright Campus','Galgame Art','Chibi','Idol Rhythm Game','Cel Anime','Modern Digital Anime','Retro Occult Print','Industrial Tech','Blueprint','Chinese Ink Painting','Ukiyo-e','Paper Cut','Impressionism','Pop Art','Graffiti','Pixel Art','Cyberpunk','Vaporwave','Glitch Art'];
const ink='#131917',paper='#f7f1df',red='#f04432',mono="Consolas,monospace",sans="'Arial Black','Microsoft YaHei',sans-serif";
const R=(x,y,w,h,c,e='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}" ${e}/>`,P=(d,c,e='')=>`<path d="${d}" fill="${c}" ${e}/>`,C=(x,y,r,c,e='')=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" ${e}/>`,L=(x,y,X,Y,c,w=1,e='')=>`<line x1="${x}" y1="${y}" x2="${X}" y2="${Y}" stroke="${c}" stroke-width="${w}" ${e}/>`,T=(x,y,str,size,c,opt='')=>`<text x="${x}" y="${y}" fill="${c}" font-family="${sans}" font-size="${size}" ${opt}>${str}</text>`,G=(s,a='')=>`<g ${a}>${s}</g>`,tr=(x,y,z=1,r=0)=>`transform="translate(${x} ${y}) rotate(${r}) scale(${z})"`,rep=(n,f)=>Array.from({length:n},(_,i)=>f(i)).join(''),rand=i=>{let a=Math.sin(i*87.51+9.74)*47311;return a-Math.floor(a)},clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x)),pi=Math.PI,st=(c,w=2)=>`stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`,mt=(x,y,str,n,c,o='')=>T(x,y,str,n,c,`style="font-family:Consolas,monospace" ${o}`),n2=n=>String(n).padStart(2,'0');
function star(x,y,r,c,points=4){return P(rep(points*2,(i)=>{let a=i*pi/points-pi/2,l=i%2?r*.29:r;return (i?'L':'M')+(x+Math.cos(a)*l)+' '+(y+Math.sin(a)*l)})+'Z',c)}
function pat(id,w,h,s){return `<pattern id="${id}" width="${w}" height="${h}" patternUnits="userSpaceOnUse">${s}</pattern>`}
function grad(id,cols){return `<linearGradient id="${id}" x2="0" y2="1">${cols.map((s,i)=>`<stop offset="${i/(cols.length-1)}" stop-color="${s}"/>`).join('')}</linearGradient>`}
const definitions='<defs>'+pat('grain',90,90,rep(220,i=>R(rand(i)*90,rand(i+300)*90,.6+rand(i+12)*2,rand(i+10)*1.9+.5,i%3?ink:paper)))+pat('dots',6,6,C(2,2,1.35,ink))+pat('chalk',11,11,L(-2,10,10,-2,paper,.9))+pat('grid',35,35,P('M0 35V0H35','none',st('#c4e4ff',.7)))+pat('scan',4,5,R(0,0,4,1,'#000'))+pat('brick',80,38,P('M0 0H80M0 19H80M40 0V19M0 19V38','none',st('#2f2a3e',2)))+pat('finish',24,24,R(0,0,24,24,paper)+R(0,0,12,12,ink)+R(12,12,12,12,ink))+grad('vsky',['#8b69bb','#ffa1c5','#ffdeab'])+grad('blueSky',['#297ec8','#86d7f2','#f3faf1'])+grad('night',['#111c35','#273954','#3c4c63'])+grad('glow',['#e2fffc','#ff84bf','#8265aa'])+grad('sunFeather',['#fffbe7','#fff4d8','#d5ddd3','#bdcdd1'])+grad('marbleStone',['#fff0e9','#f0dce2','#d0b9d0','#ecdce6','#bfabc5'])+grad('metal',['#323c42','#a4b4ad','#576261'])+'<filter id="red-channel"><feFlood flood-color="#ff4989"/><feComposite in2="SourceAlpha" operator="in"/></filter><filter id="cyan-channel"><feFlood flood-color="#5ce3e5"/><feComposite in2="SourceAlpha" operator="in"/></filter><filter id="shadow" x="-15%" y="-15%" width="135%" height="140%"><feDropShadow dx="5" dy="8" stdDeviation="4" flood-opacity=".28"/></filter><filter id="bleed"><feTurbulence type="fractalNoise" baseFrequency=".05 .12" numOctaves="2" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="4"/></filter><filter id="soft"><feGaussianBlur stdDeviation="3"/></filter></defs>';
const palettes=[
[ink,paper,red,ink,red],[ '#112432','#dbb974','#dfae64','#182c3e','#ffd98c'],['#fff2c6','#354746','#ffbf51','#385f62','#c26642'],['#fffbef','#59798c','#ffc174','#7abecf','#4a8298'],['#fff5e7','#926c7b','#f8baa1','#bb9fa9','#d79bac'],['#fff9dc','#8b6772','#ffbf75','#ef8eaa','#8bb6b8'],['#eef9ff','#333158','#ffbb69','#d6498d','#89f2ff'],['#fff5da','#353f4c','#f3ac68','#427e85','#bf644a'],['#fff5dd','#6c7f8a','#ffb77e','#a6c9c9','#518fa1'],['#ada184','#433f32','#c6b890','#655f4e','#534c3b'],['#b5b8ae','#1e272a','#e6c14e','#37444a','#ebc144'],['#24558a','#d9eeff','#2a6298','#23568e','#ceeafe'],['#dad8c6','#3a433a','#777567','#687065','#424d43'],['#dbd1ae','#233e52','#c9a175','#3e6173','#29475e'],['#fff3d8','#6d7770','#e5b67e','#edc999','#f4e3ba'],['#f0e5be','#7c8e83','#dbad7b','#75a699','#9e907e'],['#fff3c4',ink,'#ffd343','#43a8c8','#e34c47'],['#f8efb4','#272335','#fca83e','#7cedcf','#d64aa2'],['#fff7cc','#29334a','#ef9b4d','#b16056','#f5bc5d'],['#1b233f','#63eaf1','#f785bc','#442e5a','#ff6eac'],['#efdaec','#796897','#e2b1cd','#cba5d0','#7476b0'],['#1e2a2f','#b3ffd8','#ff6f9c','#775a99','#45dacf']];
const drawingIds=new Map();
// Store repeated vector geometry once. Only its transform changes on screen.
function fixedDrawing(key,draw){
 let id=drawingIds.get(key);
 if(!id){
  id='asset-'+key.replace(/#/g,'');
  document.getElementById('drawing-library').insertAdjacentHTML('beforeend','<g id="'+id+'">'+draw()+'</g>');
  drawingIds.set(key,id);
 }
 return '<use href="#'+id+'"/>';
}
function ease(v){let k=clamp(v);return k*k*(3-2*k)}
function ridingPose(t,x,y,scale,angle){
  const local=ease(Math.min(t/.95,(6-t)/.95));
  return tr(640+(x-640)*local,288+(y-288)*local,1+(scale-1)*local,angle*local);
}
function bike(i,t,plain=false,spread=0){
if(i===18)return pixelRider(t);
let [body,edge,bill,shade,frame]=palettes[i]||['#faf8ef','#273333','#faf8ef','#f4f1e4','#273333'];if(i===8)body='url(#sunFeather)';if(i===20)body='url(#marbleStone)';let collage=i===0,line=i===14?1.3:plain?2.5:i===16?4:2.4;let a=t*pi*2, pedal=[84+19*Math.cos(a),157+19*Math.sin(a)],p2=[168-pedal[0],314-pedal[1]];
function wheel(x){let rim=i===14?'#ede4c8':plain?edge:i===1||i===11||i===19||i===21?edge:'#36454a';
return C(x,188,53,'none',st(rim,i===11?2.6:plain?3:8))+C(x,188,48.5,'none',st(frame,1.7))+
 rep(i===12?10:22,j=>{const b=j*pi/(i===12?5:11)-a*.9;return L(x+4*Math.cos(b),188+4*Math.sin(b),x+47*Math.cos(b+.16),188+47*Math.sin(b+.16),rim,1.35)})+C(x,188,5,bill,st(edge,2))}
let wheels=wheel(0)+wheel(203);
if(i===19)wheels+=rep(2,j=>C(j*203,188,52,'none',st('#5ce3e6',10)+' opacity=".16"')+C(j*203,188,51,'none',st('#87ffec',2.3))+C(j*203,188,47,'none',st('#f7a0d2',1.4)));
if(collage){
function printWheel(x){return C(x,188,57,ink,st(paper,2))+C(x,188,48,paper,st(red,2.5))+rep(28,j=>{let b=j*pi/14-a*.75;return L(x+4*Math.cos(b),188+4*Math.sin(b),x+46.5*Math.cos(b+.15),188+46.5*Math.sin(b+.15),ink,j%4?1.4:2.4)})+C(x,188,8,ink,st(paper,1))+C(x,188,3,red)}
wheels=printWheel(0)+printWheel(203)
}
if(plain) return [0,203].map(x=>C(x,188,53,'none',st(edge,3))+G(P('M-44 0h88M0 -44v88','none',st(edge,1.3)),tr(x,188,1,t*360))).join('')+P('M0 188L48 103L84 157L177 112L203 188M84 157L0 188M48 103L41 87M28 87H55M177 112L164 77H182','none',st(edge,4))+P('M7 54Q41 8 83 33Q100 32 96 -5Q89 -39 113 -43Q133 -46 140 -29L209 -14L137 -16Q139 40 98 65Q57 85 7 54Z',body,st(edge,2.5))+C(123,-31,2.5,edge)+P(`M62 68l-8 36L${pedal.join(' ')}l12 0`,'none',st(edge,4));
if(i===5){const rock=Math.sin(a),reach=ease((t%6-1.5)/.5)*(1-ease((t%6-4.1)/.5));
let pedals=C(84,157,13,'#fff0cd',st('#a57782',3))+G(P('M-17 0h34','none',st('#9a7883',4))+L(-22,-1,-13,1,'#8b7178',4)+L(13,-1,22,1,'#8b7178',4),tr(84,157,1,t*360));
let mini=G(wheels+P('M0 188L49 104L84 157L0 188M49 104L174 106L84 157M174 106L203 188M174 106L164 77h17','none',st('#a77483',9))+P('M31 91h35','none',st('#795762',8))+pedals,tr(19,92,.65));
return mini+G(P('M9 79Q-3 47 28 32Q62 15 85 38Q107 60 87 90Q60 115 20 95L-5 95Z',body,st(edge,3))+P('M15 63Q41 44 60 61Q58 78 3 85Z','#f5cdbd',st(edge,2))+G(P('M0 0q-3 18 10 27l13 -2','none',st(bill,6.5)),tr(47,93,1,rock*(8+18*reach)))+G(P('M0 0q-1 18 10 27l12 -3','none',st(bill,6.5)),tr(69,89,1,-rock*(8+15*reach)))+P('M45 32Q6 9 19 -33Q28 -66 70 -66Q117 -68 126 -35Q137 4 111 28Q81 49 45 32Z',body,st(edge,3.5))+P('M106 -31Q144 -33 183 -13Q159 19 128 18Q113 17 104 6Z',bill,st(edge,3))+P('M108 -28l72 15l-73 2Z','#ffdf99')+C(93,-30,9,edge)+C(95,-33,3.5,'white')+C(87,-9,9,'#f5b2b2')+P('M42 -58q-14 -18 -20 -9q4 11 21 17m-7 -11q-4 -19 6 -17l10 18',body,st(edge,2.5))+P('M93 51q21 12 32 33','none',st(edge,4)),'transform="translate('+(6+rock*reach*7)+' 42) rotate('+(rock*(3+6*reach))+' 44 100)"')+G(P('M0 -9Q9 1 6 6Q1 11 -4 6Q-7 2 0 -9Z','#89cbd3',st('#fff6db',1.5))+C(2,2,1.5,'#fff6db'),tr(126+6*rock,-9+7*Math.sin(a),reach))}

let machine=P('M0 188L51 103L84 157L0 188M51 103L174 105L84 157M174 105L203 188M51 103L44 85M173 105L164 77Q162 70 173 70L185 67','none',st(edge,7.5))+P('M0 188L51 103L84 157L0 188M51 103L174 105L84 157M174 105L203 188','none',st(frame,4))+P('M24 83Q40 78 61 82L57 88L30 89Z',edge)+C(84,157,15,'none',st(edge,3))+P('M-2 184L80 142Q103 139 98 160Q96 168 83 171L-2 192Z','none',st(edge,1.7))+C(174,66,5,bill,st(edge,1.4));
if(collage)machine=machine.replaceAll('stroke="'+paper+'"','stroke="'+ink+'"')+mt(77,112,'F / 01',5.5,paper,'font-weight="bold"')+P('M31 82l24 -1l-4 5l-29 1Z',ink)+C(84,157,13,paper,st(ink,2))+rep(5,j=>G(P('M0 -1L-2 -11L2 -11Z',ink),tr(84,157,1,j*72+t*360)));
let leg=(p,far)=>P(`M${far?65:79} 61Q78 85 ${far?96:86} 102L${p[0]-5} ${p[1]-3}l17 1l5 4l-20 2`,'none',st(far?shade:bill,5))+L(84,157,...p,edge,3)+L(p[0]-6,p[1]+3,p[0]+9,p[1]+3,edge,4);
let neck=P('M-36 41L-9 39Q12 22 46 24Q73 25 81 17Q88 9 83 -15Q76 -42 91 -58Q102 -73 129 -66Q142 -63 147 -51L139 -28Q133 -7 129 22Q124 52 96 69Q63 89 21 68L-36 53L-16 49Z',body,st(edge,line));
let head=P('M92 -49Q108 -63 126 -58L142 -50L131 -40L112 -47Z',collage?paper:shade)+C(126,-52,5,edge)+C(127,-54,1.7,paper)+P('M137 -49Q172 -49 212 -40L258 -32Q254 -25 236 -26Q201 -5 164 -8Q143 -10 136 -28L128 -33Z',bill,st(edge,line))+P('M137 -46Q191 -44 255 -32Q194 -35 135 -29Z',collage?paper:body,st(edge,1.2))+P('M142 -26Q155 -12 177 -13L223 -24Q169 -3 152 -15Z',shade)+P('M238 -30l19 -2l-8 9Z',edge);
let wing=P('M-35 44Q4 33 19 29Q42 19 72 36Q86 45 68 55Q30 76 -38 58L-18 53L-46 53L-18 46Z',shade,st(edge,line))+rep(5,j=>P(`M${55-j*4} ${36+j*3} Q${35-j*3} ${41+j*3} ${-25+j*5} ${47+j*2} Q${23+j*2} ${46+j*3} ${55-j*4} ${36+j*3}Z`,collage?paper:body));
if(i===5){head=G(head,tr(-48,15,1.43))+C(114,-42,5,'#eaa6a9');neck+=C(104,-43,27,body,st(edge,2))}
let tex=i===0||i===16||i===9?P('M82 19Q102 8 104 -26L114 -32Q113 37 85 48Z','url(#dots)'):'';
let accessory=i===1?P('M81 -11Q72 -3 67 -4L44 -12L63 -2L43 2L74 7L87 1Z',bill):i===2?P('M88 -5L108 6Q74 58 0 34L-32 27Q30 33 88 -5Z','#b54f3b',st('#e7bd6a',3))+P('M172 76v13m-7 1h14l3 17h-20z','#f9d67d',st(edge,2)):i===3?`<ellipse cx="112" cy="-84" rx="28" ry="6" fill="none" stroke="#83dfff" stroke-width="4"/>`:i===6?P('M81 10L109 24L90 58L70 60L48 34Z','#ee67ac',st('#9bf8ff',2))+star(78,37,9,'#fff'):i===7?G(P('M-15 -3q-10 -10 -2 -17q5 -6 13 -3q10 -7 20 -2q12 5 7 17l-3 4v27h-34Z','#e2ad69',st('#925f42',2.2))+P('M-10 -4q-9 -8 -3 -12q6 -5 12 -1q8 -7 16 -3q7 4 4 10l-5 5v22h-24Z','#fae7b5')+rep(8,j=>C(-7+rand(j)*19,-9+rand(j+51)*21,1.15,'#e4ca94')),tr(241,-23,1,14+Math.sin(a)*5)):i===10?((t%6>=2?P('M83 -53Q84 -83 119 -77Q141 -75 142 -57L151 -52L81 -48Z','#e6bf3d',st(edge,2)):'')+(t%6>=2.75?R(109,-56,28,9,'#354d55'):'')+P('M53 24L74 21L90 64L66 71Z','#d2a842')+mt(61,49,'07',9,edge)+(t%6>=3.5?P('M61 32l11 -3l9 31l-12 3Z','#f8d34f',st(edge,1.1)):'')):i===19?R(105,-57,36,10,'#5ff5fb', 'rx="4"'):'';
if(i===1){
 wing+=rep(6,j=>P('M'+(-17+j*8)+' '+(54+j%2*2)+'q17 1 38 -14q-8 12 -22 15','none',st('#a98b58',1)));
 accessory+=G(C(0,0,6,'#1e3443',st('#daae65',1))+star(0,0,4,'#e7c37d'),tr(88,2));
}
if(i===2){accessory+=P('M64 19q8 -10 21 -11l10 11l-17 12Z','#d8ac5c',st(edge,1.2))+star(79,17,7,'#f7edbf')}
if(i===6){accessory+=P('M86 -9l17 12l-10 9l-12 -5l-11 6l-3 -17Z','#74d8e9',st(edge,1.5))+star(94,-60,8,'#ffd882')}
if(i===7||i===8){neck+=P('M91 -42Q97 -19 96 -2Q100 28 65 43L86 48Q124 29 123 -11L132 -32L110 -28Z',i===7?'#c7c7bd':'#c1ccd1');wing+=P('M-20 52q45 -3 76 -19q-11 19 -62 24Z',i===7?'#929d9e':'#b6bdb6')}

if(i===4){
 head+=P('M116 -55q8 -6 15 -2m-3 -1l3 -3','none',st('#8f707e',1.7))+C(126,-54,1.9,'#fffaf1')+
 P('M114 -42q6 -3 9 0m-8 2l2 -3m2 3l2 -3','none',st('#eab6be',1.2));
 wing+=P('M-13 47q38 -10 59 -16q-14 11 -49 17Z','#f4e5dc');
}
if(i===8){
 neck+=P('M84 15Q92 4 86 -24Q80 -44 92 -57Q103 -69 122 -65','none',st('#fff8cc',2.5));
 head+=P('M145 -47Q180 -46 217 -38','none',st('#fff7cf',2))+C(127,-54,2,'#fffdeb');
 wing+=P('M-31 44Q25 24 47 27','none',st('#fff3cb',2.5));
}
if(i===12){wing+=rep(9,j=>P('M'+(-35+j*2)+' '+(48+j*1.4)+'q41 -9 82 -16q-12 8 -82 16Z',j%3?'#3d453b':'#c9ccba'));neck+=P('M90 -38q6 54 -12 65q26 -12 25 -48Z','#6b7263')}
if(i===13){wing+=rep(6,j=>P('M'+(-18+j*7)+' '+(52+j*.6)+'q27 -5 51 -17','none',st('#d4c39f',1)));accessory+=P('M83 -16l42 -1l-2 11l-42 -4l-21 8l7 -9l-14 -2Z','#b9654f',st(edge,1.6))}
if(i===14){wing=P('M-39 53L3 30L38 22L75 41L62 55L25 64L0 61L-30 59L-19 54Z','#f4e5c5',st('#b6aa8b',1.3))+P('M-26 54l79 -21l-42 21Z','#fff7dd');head=head.replaceAll(bill,'#f2d9a7')}
if(i===15){wing+=rep(58,j=>{let px=rand(j)*84-16,py=48+(rand(j+92)-.5)*15-(px/9);return L(px,py,px+rand(j+8)*12+2,py-3,['#c6c4a5','#95a99e','#e5d3a7','#a5bcac'][j%4],2.8)});neck+=rep(32,j=>L(99+rand(j)*16,-28+rand(j+33)*53,104+rand(j)*16,-23+rand(j+33)*53,j%3?'#e4d6b5':'#b2b9a7',3))}
if(i===17){
 let glance=ease((t-3.08)/.29)*(1-ease((t-4.3)/.32));
 head=G(head,'transform="translate(100 -32) scale('+(1-2*glance)+' 1) translate(-100 32)"');
 if(t<.8||t>4.57)accessory+=G(R(0,0,10,24,'#93efd1',st(edge,1.7))+R(2,-4,6,5,'#f7d482'),tr(154,49,1,-15));
}
if(i===20){
 neck+=P('M92 -38q9 16 3 27l6 13l-5 17M100 -8l7 3l1 6M114 5l-7 18l-11 10','none',st('#c9b3ca',1.55));
 wing+=P('M-15 49l17 1l17 -9l13 0l15 -10m-24 10l5 -8','none',st('#ad98b8',1.5));
}
if(i===19){accessory=P('M80 -55l24 2l9 -6l25 -1l9 8l-5 10l-26 2l-10 -5l-22 -3Z','#243047',st('#75f6ec',1.6))+P('M112 -54l23 -2l7 5l-4 6l-21 1l-7 -4Z','#9be9ec')+P('M118 -47l8 -7l6 0l-9 8Z','#effef8')+L(84,-52,105,-49,'#d986b9',2);let glance=Math.sin(pi*clamp((t-1.85)/2));head=G(head,'transform="rotate('+(-13*glance)+' 95 -26)"');accessory=G(accessory,'transform="rotate('+(-13*glance)+' 95 -26)"');neck+=P('M81 24q32 -4 31 -40l11 -12l-2 44q-7 32 -38 42Z','#38465d',st('#ae72bd',1));accessory+=L(31,41,60,35,'#69eeec',2)+L(35,46,57,41,'#ff96c9',2)}
if(collage){head+=C(125,-52,4.3,red,st(ink,1.2))+C(126,-53,2.1,ink)+C(127,-54,.8,paper)+P('M87 -51Q89 -76 108 -78L124 -76Q133 -72 137 -62L151 -60L143 -56L115 -59Z',ink,st(paper,1.7))+P('M94 -61Q94 -73 108 -75L103 -63Z',red)+P('M111 -74L119 -73L114 -62L108 -62Z',paper);
accessory+=P('M85 -16L125 -9L122 -1L84 -6Q57 1 37 -13L14 -11L28 -20L9 -28Q43 -31 62 -19Z',red,st(ink,1.5))+P('M16 -26Q45 -28 65 -16L80 -12Q50 -15 39 -21Z',paper)+P('M35 -17L21 -12L31 -20Z',ink);
neck+=P('M93 -3Q106 12 95 34Q113 18 113 -1L108 17L107 -2Z',paper);
}
const reusable=i!==16&&i!==17&&i!==19&&i!==21;
let upper=reusable?fixedDrawing('plumage-'+i,()=>neck+tex+head+wing):neck+tex+head+wing;
if(i===14&&t>2&&t<4){
 const turning=t<2.5?ease((t-2)/.5):1-ease((t-3.16)/.84);
 const flip=Math.cos(turning*pi);
 const back=P('M-39 54L-11 38L34 25Q81 29 86 8L82 -24Q77 -62 104 -68Q134 -72 145 -50L258 -32Q191 3 136 -14Q134 45 96 69Q59 88 12 66L-37 58L-21 54Z','#fff8e4',st('#baae90',1.3));
 upper=G(flip<0?back:upper,'transform="translate(67 '+(-9*Math.sin(turning*pi))+') scale('+flip+' 1) translate(-67 0)"');
}
const tap=i===8?ease((t-3.72)/.28)*(1-ease((t-4.04)/.32)):0;
const blankBack=i===14&&t>2.21&&t<3.56;
const reach=blankBack?'':P('M85 34Q106 40 120 58L159 67L168 65','none',st(edge,4))+P('M87 33Q110 45 122 54L160 65L146 63L114 60Z',body,st(edge,1.5));
const occupant=leg(p2,true)+upper+leg(pedal,false)+accessory+(tap?G(reach,'transform="translate(85 34) scale('+(1+.076*tap)+' '+(1+.025*tap)+') translate(-85 -34)"'):reach);

if(i===11){
 const pin=(x,y,label,dx,dy)=>G(P('M0 0l'+dx+' '+dy+'h12','none',st('#bddeee',.8))+C(dx+19,dy,7,'#255485',st('#d2e8f5',.9))+mt(dx+19,dy+2.7,label,6.5,'#ecf7fa','text-anchor="middle"'),tr(x,y));
 machine+=pin(148,106,'01',14,19)+pin(75,161,'02',25,14)+pin(174,69,'03',16,-18);

}if(i===11&&spread>0){
 const out=34*spread,up=49*spread,col='#d4eaff';
 const guides=P('M'+(-out)+' 188H0M203 188h'+out+'M48 89v-'+up,'none','stroke="#c0e1fc" stroke-width="1" stroke-dasharray="3 3"');
 const hubs=rep(2,j=>G(C(0,0,6,'none',st(col,1.4))+C(0,0,2,col),tr(j?203+out*.48:-out*.48,188)));
 return guides+wheel(-out)+wheel(203+out)+hubs+machine+G(occupant,tr(0,-up));
}
if(!collage&&i!==16&&i!==21)machine=fixedDrawing('cycle-frame-'+i,()=>machine);
return wheels+machine+occupant;
}
function city(x0,y,scale,col,win,seed=0){const cityscape=fixedDrawing('city-'+seed+'-'+col+'-'+win,()=>{let s='';for(let i=0;i<26;i++){let x=i*55,h=30+rand(i+seed)*140,w=28+rand(i+seed+40)*32;s+=P(`M${x} 0v-${h}l${w*.23} -6h${w*.77}V0Z`,col)+R(x+w*.67,-h-15,5,15,col);for(let k=0;k<Math.floor(h/17);k++)for(let j=0;j<3;j++)if(rand(k*18+i*41+j)>.23)s+=R(x+5+j*9,-h+7+k*15,4,7,win)}return s});return G(cityscape,tr(x0,y,scale))}
function poster(t,cover=false,pedalTime=t){let s=R(0,0,1200,675,paper);let N=22;for(let j=0;j<N;j++){let a=j*2*pi/N-.15,b=a+.08+rand(j)*.13;s+=P(`M820 376L${820+1550*Math.cos(a)} ${376+1550*Math.sin(a)}L${820+1550*Math.cos(b)} ${376+1550*Math.sin(b)}Z`,red)}
s+=P('M0 0H605L256 280L0 359Z',red)+P('M0 0H418L0 126Z',ink)+P('M945 0H1169L866 283Z','url(#dots)')+P('M0 489L540 394L175 590H0Z','url(#dots)')+P('M1078 675L1200 419V675Z',ink);
s+=G(city(-55,568,.99,ink,paper,6),'transform="rotate(-5 600 500)"')+P('M0 586L1200 445V675H0Z',ink)+P('M0 623L1200 451V510L0 661Z',red)+P('M0 637L1200 482V514L0 669Z',paper)+P('M0 602L1200 454','none',st(paper,2))+rep(25,j=>P(`M${j*53-50} ${642-j*6.75}l32 -5l-17 5Z`,ink));
s+=G(rep(7,i=>L(-40,29+i*9,113,29+i*9,paper,1.3))+mt(151,55,'FRAME STUDY   /   No. 01',15,paper,'letter-spacing="2"'),tr(0,0,1,-4));
let tilt='transform="translate(53 145) rotate(-8)"';let headline=(x,y,str,size,c,sk=0)=>T(x,y,str,size,c,`font-weight="1000" stroke="${c}" stroke-width="3" paint-order="stroke" transform="skewX(${sk})"`);
if(!cover&&t>=2&&t<2.38){s+=P('M0 0H1010L0 675Z',ink,'opacity="'+(.72*(1-(t-2)/.38))+'"')+P('M0 675L1010 0H1200V675Z',red,'opacity="'+(.8*(1-(t-2)/.38))+'"')}
let torn=P('M-13 -17L386 -20L379 -12L394 -9L382 -3L394 2L386 11L395 16L387 29L-17 32L-8 22L-18 18Z',ink)+mt(1,12,'01  /  RED–BLACK COLLAGE',19,paper,'font-weight="bold" letter-spacing="2"');
s+=G(T(873,44,CN[0],20,ink,'font-weight="bold" letter-spacing="4"')+mt(870,65,'COLLAGE  /  001',11,ink,'letter-spacing="2"'),tr(0,0));if(cover)s+=G(torn+G(P('M-24 40L318 33L311 46L330 45L323 61L335 55L327 73L341 74L324 88L333 93L315 109L331 106L316 123L322 133L310 145L325 151L302 167L310 177L-24 182L-16 162L-26 164Z',paper)+headline(-7,157,'鹈鹕，',130,ink,-5))+G(P('M-23 192L386 179L375 190L391 192L378 201L390 209L376 219L390 224L377 235L389 240L374 250L383 254L371 268L388 269L368 280L384 283L371 296L377 302L367 316L372 322L-27 329L-18 315L-26 311Z',ink)+headline(3,308,'出发！',131,paper,-9))+G(R(0,0,258,34,red)+mt(10,24,'PEDAL  TO  THE  BEAT',17,ink,'font-weight="bold" letter-spacing="2"'),tr(-8,343)),tilt);
else s+=pressHeadline(t,torn);
s+=star(500,105,48,ink,5)+star(1104,81,38,ink,5)+star(566,270,cover?16:7+9*Math.cos(t*pi*2)**8,paper,4)+rep(3,j=>P(`M${462+j*33} ${346-j*15}l155 -27l-30 11Z`,ink));
let x=cover?691:645+clamp(t/1.1)*46+Math.max(0,t-4.6)*60;let y=cover?196:196+Math.sin(t*pi*2)*2;s+=G(bike(0,pedalTime),(cover?tr(x,y,1.48,-7):ridingPose(t,x,y,1.48,-7-Math.sin(clamp(t-2)*pi)*6)));
s+=G(P('M0 -28L286 -28L277 -21L289 -19L282 -11L289 -5L277 1L281 8L-4 9Z',paper)+mt(9,-3,'FIG. 01   /   PELECANUS',16,ink,'letter-spacing="2" font-weight="bold"'),tr(851,587,1,-7))+G(mt(235,660,'PL. 01     •     COLLAGE SERIES',13,paper,'letter-spacing="2"')+mt(938,649,'FRAME LAB    /    001',13,paper,'letter-spacing="2"'))+R(0,0,1200,675,'url(#grain)','opacity=".22"');
return s}


const pixelRiderFrames=[];
function pixelRider(t){
 const frame=((Math.floor(t*8)%8)+8)%8;
 if(pixelRiderFrames[frame])return pixelRiderFrames[frame];
 const sx=-17,sy=-23,w=84,h=88,pixels=new Uint8Array(w*h);
 const colours=['none','#233446','#495563','#80959a','#d4d9af','#fff1c9','#c8b984','#dd9859','#f5c76a','#ae694f','#b2524a','#eb8970','#5c8786'];
 const dot=(x,y,c)=>{x-=sx;y-=sy;if(x>=0&&x<w&&y>=0&&y<h)pixels[y*w+x]=c};
 function line(x,y,xx,yy,c,thick=1){
  x=Math.round(x);y=Math.round(y);xx=Math.round(xx);yy=Math.round(yy);
  const dx=Math.abs(xx-x),dy=-Math.abs(yy-y),ax=x<xx?1:-1,ay=y<yy?1:-1;
  let err=dx+dy;
  for(;;){for(let a=0;a<thick;a++)for(let b=0;b<thick;b++)dot(x+a,y+b,c);
   if(x===xx&&y===yy)break;
   const twice=err*2;if(twice>=dy){err+=dy;x+=ax}if(twice<=dx){err+=dx;y+=ay}
  }
 }
 function poly(pts,c){
  const ys=pts.map(p=>p[1]);
  for(let y=Math.min(...ys);y<Math.max(...ys);y++){
   let xs=[];for(let j=0;j<pts.length;j++){const [a,b]=pts[j],[u,v]=pts[(j+1)%pts.length];
    if((b<=y+.5&&v>y+.5)||(v<=y+.5&&b>y+.5))xs.push(a+(u-a)*(y+.5-b)/(v-b))}
   xs.sort((a,b)=>a-b);for(let j=0;j+1<xs.length;j+=2)for(let x=Math.ceil(xs[j]-.5);x<xs[j+1]-.5;x++)dot(x,y,c);
  }
 }
 const a=frame*pi/4,px=Math.round(21+5*Math.cos(a)),py=Math.round(39+5*Math.sin(a));
 for(const cx of [0,51]){
  const rim=a+rimEntry[18][cx?1:0]-pi/2;
  for(let j=0;j<6;j++)line(cx,47,cx+11*Math.cos(rim+j*pi/3),47+11*Math.sin(rim+j*pi/3),3);
  for(let yy=-14;yy<=14;yy++)for(let xx=-14;xx<=14;xx++){
   const rr=(xx+.5)**2+(yy+.5)**2;if(rr>=117&&rr<=196)dot(cx+xx,47+yy,rr>167?1:rr<135?4:xx+yy<0?3:2)
  }
  line(cx-1,46,cx+1,46,7,2);dot(cx+Math.round(12*Math.cos(rim+.61)),47+Math.round(12*Math.sin(rim+.61)),8);
 }
 for(const [x,y,X,Y] of [[0,47,13,26],[13,26,21,39],[21,39,0,47],[13,26,43,26],[43,26,21,39],[43,26,51,47],[13,26,11,20],[43,26,40,18],[40,18,45,17]]){
  line(x,y,X,Y,1,2);line(x,y,X,Y,10)
 }
 line(7,20,15,20,1,2);line(8,20,14,20,9);line(21,39,px,py,2);line(px-2,py,px+2,py,1);
 line(16,17,19,27,9,2);line(19,27,42-px,78-py,9,2);
 const body=[[-12,12],[-5,10],[1,6],[10,5],[17,7],[20,5],[20,-5],[19,-10],[21,-15],[25,-18],[31,-18],[35,-15],[36,-12],[44,-11],[61,-8],[59,-6],[47,-2],[39,-1],[34,-4],[33,4],[31,10],[25,16],[16,20],[7,19],[-3,16],[-10,16],[-8,14]];
 poly(body,1);poly([[-9,12],[-3,10],[2,7],[10,6],[17,8],[21,5],[21,-5],[20,-10],[23,-15],[26,-17],[31,-17],[34,-14],[34,-9],[32,-4],[31,5],[28,11],[22,16],[15,18],[7,18],[-4,15],[-8,15],[-5,13]],5);
 poly([[24,-6],[27,-7],[26,2],[24,8],[18,12],[24,10],[29,4],[28,8],[22,14],[15,17],[10,17],[19,10]],4);
 poly([[33,-12],[43,-10],[59,-8],[47,-8],[36,-7],[33,-7]],8);
 poly([[34,-6],[56,-7],[47,-3],[40,-2],[36,-4]],7);
 line(22,-14,27,-16,4);line(28,-14,31,-14,2);line(30,-14,31,-13,1);dot(30,-14,5);dot(31,-12,2);line(24,-3,25,0,4);
 poly([[-11,12],[-3,9],[4,7],[11,7],[17,10],[14,13],[8,15],[-8,15]],2);
 poly([[-9,13],[2,9],[10,8],[15,10],[11,12],[3,13]],4);line(-5,14,9,11,6);
 line(23,10,30,15,1,2);line(30,15,40,17,1,2);line(23,10,30,15,4);line(30,15,40,17,5);
 line(18,18,19,26,7,2);line(19,26,px-1,py-1,7,2);line(px-1,py-1,px+3,py-1,8);
 const paths=colours.map(()=>[]);
 for(let y=0;y<h;y++)for(let x=0;x<w;){const c=pixels[y*w+x],start=x++;while(x<w&&pixels[y*w+x]===c)x++;if(c)paths[c].push('M'+(start+sx)+' '+(y+sy)+'h'+(x-start)+'v1h'+(start-x)+'Z')}
 return pixelRiderFrames[frame]=G(paths.map((d,j)=>d.length?P(d.join(''),colours[j]):'').join(''),'transform="scale(4)" shape-rendering="crispEdges"');
}
function pressHeadline(t,heading){
 const letters=['鹈','鹕','，','出','发'];
 const starts=[[-690,-390],[828,-520],[555,448],[-546,412],[1020,86]];
 const widths=[108,105,49,105,108],angles=[-31,23,47,19,-22];
 let cards='',left=0;
 for(let j=0;j<letters.length;j++){
  const q=ease((t-.36-j*.21)/.80),w=widths[j],dy=[1,-4,5,-3,0][j];
  let strip=P('M0 -86l'+(w*.62)+' -3l4 3l'+(w*.38-3)+' -2l-3 13l4 -2l-2 17l3 4l-3 15l3 5l-4 11l3 9l-2 9l3 6l-3 11l-2 3l-'+(w-3)+' 2l2 -8l-3 -6l2 -11l-3 -8l3 -9l-3 -11l2 -10l-2 -5Z',j<3?paper:ink);
  strip+=T(2,0,letters[j],j===2?64:99,j<3?ink:paper,'font-weight="1000" stroke="'+(j<3?ink:paper)+'" stroke-width="2.8" paint-order="stroke"')+
   mt(5,15,'ED. '+n2(j+1),7,j<3?ink:paper,'letter-spacing="1"');
  cards+=G(strip,tr(left+(1-q)*starts[j][0],dy+(1-q)*starts[j][1],1+.12*(1-q),angles[j]*(1-q)));
  left+=w+3;
 }
 const hit=ease((t-1.65)/.35);
 return G(heading+G(cards,tr(-8,130))+G(P('M0 0l336 -4l-6 10l9 3l-9 11l5 4l-335 9Z',ink)+
 mt(12,23,'PEDAL TO THE BEAT   /   120',18,paper,'letter-spacing="1" font-weight="bold"'),tr(4,167,hit))+
 G(P('M-20 -12l116 -1l-7 -10l44 15l-45 22l8 -14l-118 7Z',red),tr(320,231,hit,-7)),tr(44,207,1,-10));
}


