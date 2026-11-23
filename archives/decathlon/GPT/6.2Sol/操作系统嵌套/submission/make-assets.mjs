import fs from 'node:fs';
import {bakeFlight} from './bake-flight.mjs';
fs.mkdirSync('assets',{recursive:true});
const rng=(n)=>{let x=Math.sin(n*127.1+91.7)*43758.5453;return x-Math.floor(x)};
function ridge(seed,y,amplitude,detail){
  let d='M-30 885';
  for(let i=0;i<=detail;i++){
    let x=-30+i*1660/detail;
    let height=y-Math.sin(i/detail*Math.PI)*amplitude*.48-(rng(i+seed)*.55+.45)*amplitude+(Math.sin(i*.8)+Math.cos(i*1.82))*amplitude*.11;
    d+=' L'+x.toFixed(1)+' '+height.toFixed(1);
  }
  return d+' L1630 925 H-30Z';
}
const pine=(x,y,h,color,rot)=>'<path fill="'+color+'" transform="translate('+x+' '+y+') rotate('+rot+')" d="M0 '+(-h)+' '+[-.75,-.51,-.28,-.08].map((f,i)=>'L'+(-h*(.12+i*.055))+' '+(h*(f+.12))+' L'+(-h*(.05+i*.035))+' '+(h*f)).join(' ')+'L-1 0H1 '+[-.08,-.28,-.51,-.75].map((f,i)=>'L'+(h*(.15-i*.032))+' '+(h*f)+' L'+(h*(.27-i*.05))+' '+(h*(f+.12))).join(' ')+'Z"/>';
const paths=[
 ['M0 524L100 450 176 466 285 368 326 374 454 233 484 224 553 292 630 333 709 267 749 283 820 376 877 362 977 229 1039 202 1102 288 1148 279 1279 393 1365 332 1600 429V900H0Z','url(#back)'],
 ['M0 524L100 450 176 466 285 368 326 374 454 233 484 224 553 292 530 287 512 270 498 300 492 268 470 288 452 316 453 278 413 322 377 331 324 395 285 376 181 478Z','#fde2c5'],
 ['M877 362L977 229 1039 202 1102 288 1148 279 1279 393 1226 358 1147 295 1114 303 1084 276 1078 295 1048 257 1022 287 1023 249 1001 272 980 276 974 265 930 323Z','#f6d6ba'],
 ['M284 559L394 433 484 224 451 365 459 398 387 492 470 435 538 378 536 331 555 305 634 339 587 362 573 466 429 519 420 573Z','#797582'],
 ['M760 531L913 433 1039 202 1023 326 975 401 1006 384 987 446 944 481 1015 466 1163 342 1227 395 1158 520 947 619Z','#877582'],
 ['M0 485L79 499 141 478 222 520 316 474 379 491 442 465 567 519 645 491 739 541 837 502 955 557 1021 480 1156 537 1273 464 1370 482 1461 407 1600 440V900H0Z','url(#middle)'],
 ['M0 558L104 541 225 602 346 575 464 601 592 555 693 625 853 561 911 601 1108 543 1215 610 1320 553 1427 493 1600 529V900H0Z','url(#second)'],
 ['M0 653Q230 686 380 653T762 664Q876 655 1003 663T1280 642L1600 650V900H0Z','url(#lake)'],
 ['M0 672Q226 743 343 765T600 853L638 900H0Z','#243c41'],
 ['M1600 667Q1429 674 1321 747T1227 900H1600Z','#24383c'],
 [ridge(24,825,97,44),'#263e43'],
 ['M0 829Q155 785 254 826T557 900H0Z','#1d3439'],
 ['M1600 781Q1414 784 1320 841T1194 900H1600Z','#1a3037']
].map(([d,c])=>'<path d="'+d+'" fill="'+c+'"/>');
const ripples=Array.from({length:370},(_,i)=>{
 let x=rng(i+81)*1560,y=658+rng(i+221)*226;
 return '<path d="M'+x.toFixed(1)+' '+y.toFixed(1)+'h'+(3+rng(i+154)*(10+(y-658)*.39)).toFixed(1)+'" stroke="'+(i%4===0?'#ffd1ac':'#b8d0ce')+'" opacity="'+(.07+rng(i+66)*.34).toFixed(2)+'" stroke-width="'+(.6+rng(i+16)*2).toFixed(1)+'"/>';
});
const trees=Array.from({length:240},(_,i)=>{
 let x=rng(i+44)*1660-30,s=Math.abs(x-790)/800,y=912-140*s+(rng(i+31)-.5)*57,h=(15+rng(i+110)*72)*(.65+s);
 return pine(x,y,h,['#183137','#203a40','#263f45','#2b4548'][i%4],rng(i+39)*8-4);
});
paths.splice(8,0,...ripples);
fs.writeFileSync('assets/wallpaper.svg','<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><defs><linearGradient id="sky" x2=".19" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="#253d52"/><stop offset=".35" stop-color="#827984"/><stop offset=".64" stop-color="#efad90"/><stop offset="1" stop-color="#fbd5a2"/></linearGradient><linearGradient id="back" x2="0" y2="1"><stop stop-color="#a2808a"/><stop offset="1" stop-color="#505970"/></linearGradient><linearGradient id="middle" x2="0" y2="1"><stop stop-color="#575e70"/><stop offset="1" stop-color="#344757"/></linearGradient><linearGradient id="second" x2="0" y2="1"><stop stop-color="#515e68"/><stop offset="1" stop-color="#394d50"/></linearGradient><linearGradient id="lake" x2="0" y2="1"><stop stop-color="#8b8c89"/><stop offset=".3" stop-color="#607d81"/><stop offset="1" stop-color="#385a67"/></linearGradient><radialGradient id="sun"><stop stop-color="#ffdfaa"/><stop offset="1" stop-color="#ffbc91" stop-opacity="0"/></radialGradient><filter id="noise"><feTurbulence baseFrequency=".86" numOctaves="3" seed="6" stitchTiles="stitch"/></filter></defs><rect width="1600" height="900" fill="url(#sky)"/><ellipse cx="891" cy="300" rx="495" ry="260" fill="url(#sun)" opacity=".63"/><circle cx="868" cy="289" r="69" fill="#f9ddaf"/><circle cx="868" cy="289" r="83" fill="none" stroke="#ffe5bf" opacity=".26"/><path d="M136 299Q382 226 724 275M1035 304Q1328 273 1532 316M190 206Q392 156 632 196" stroke="#ffd2b5" stroke-width="7" opacity=".18" fill="none"/>'+paths.join('')+trees.join('')+'<rect width="1600" height="900" opacity=".14" filter="url(#noise)" style="mix-blend-mode:multiply"/></svg>');
const material={
 shell:{color:'#592bd1',metal:.46,rough:.29}, shellLight:{color:'#8e60ef',metal:.48,rough:.32},
 stripe:{color:'#ffcb49',metal:.23,rough:.38}, yellow:{color:'#e4a423',metal:.28,rough:.37},
 glass:{color:'#1b2e48',metal:.75,rough:.17}, frame:{color:'#211d35',metal:.56,rough:.3},
 blade:{color:'#2c253c',metal:.42,rough:.46}, rubber:{color:'#252632',metal:.12,rough:.74},
 snow:{color:'#e9e5cb',rough:.9}, rock:{color:'#536775',rough:1}, cabin:{color:'#647470',rough:.84}, roof:{color:'#28454c',rough:.76},
 concrete:{color:'#71817b',rough:.95}, heliPaint:{color:'#dbc985',rough:.84},
 beacon:{color:'#f29055',rough:.32,emissive:'#ff651c',emissiveIntensity:1.35}
};
const part=(name,shape,material,p,s,more={})=>({name,shape,material,p,s,...more});
const parts=[
 part('机身外壳','sphere','shell',[0,.05,0],[1.01,.91,2.35]),
 part('上部传动舱','sphere','shellLight',[0,.73,.03],[.76,.51,1.53]),
 part('前风挡','sphere','glass',[0,.24,1.17],[.89,.71,1.25]),
 part('前雷达罩','sphere','stripe',[0,-.31,1.69],[.77,.37,.73]),
 part('机尾梁','taper','shell',[0,.17,-2.79],[.34,2.72,.42],{r:[-Math.PI/2,0,0]}),
 part('尾翼','box','stripe',[0,.66,-4.12],[.14,.92,.68],{r:[-.38,0,0]}),
 part('水平尾翼','box','yellow',[0,.29,-3.53],[2.1,.13,.49]),
 part('旋翼主轴','cylinder','frame',[0,1.24,0],[.13,.62,.13]),
 part('旋翼轮毂','sphere','yellow',[0,1.58,0],[.3,.14,.3],{group:'rotor'}),
 part('尾旋翼轮毂','sphere','frame',[.18,.64,-4.09],[.17,.18,.18],{group:'tail'}),
 ...[0,1,2,3].flatMap(i=>[
  part('主旋翼 '+(i+1),'box','blade',[0,0,2.09],[.31,.045,3.95],{group:'rotor',yaw:i*Math.PI/2,local:true}),
  part('旋翼识别带 '+(i+1),'box','stripe',[0,.025,3.9],[.315,.028,.3],{group:'rotor',yaw:i*Math.PI/2,local:true})
 ]),
 ...[0,1,2].map(i=>part('尾旋翼 '+(i+1),'box','yellow',[0,.4,0],[.04,.7,.12],{group:'tail',roll:i*Math.PI*2/3,local:true})),
 ...[-1,1].flatMap((i)=>[
  part('舱侧风挡','sphere','glass',[i*.71,.29,.59],[.285,.45,1.09]),
  part('识别涂装','sphere','stripe',[i*.86,-.24,-.29],[.16,.23,1.36]),
  part('舱门','sphere','shellLight',[i*.84,.18,-.42],[.178,.57,.79]),
  part('机身编号','label','shell',[i*1.035,.16,-.43],[.95,.66,1],{text:'24',r:[0,i*Math.PI/2,0],ink:'#ffe895'}),
  part('起落架滑橇','cylinder','frame',[i*.94,-.91,.11],[.08,3.63,.08],{r:[Math.PI/2,0,0]}),
  ...[-1,1].map(j=>part('起落架支撑','cylinder','yellow',[i*.75,-.67,j*.99],[.055,.56,.055],{r:[0,0,i*.43]}))
 ])
];
const scene={version:1,title:'高地试飞 · 24 号',duration:15,fps:30,
 sky:{top:'#4e8199',horizon:'#f6c89b',fog:'#c7a996',sun:[-60,34,-78]},
 lighting:{sky:'#d7efff',ground:'#a38478',ambient:2.1,sun:'#ffdfaa',intensity:3.5,position:[-20,37,18]},
 terrain:{size:240,amplitude:2.3,seed:24,color:'#7f7965',colorHigh:'#a48a67',low:'#536555',grass:680},
 pads:[{x:0,z:0,r:6.1,text:'24'},{x:0,z:26,r:5.3,text:'02'}],
 terrainProps:{mountains:23,pines:112},
 obstacles:[
 part('维修机库','box','cabin',[-14,2.1,8],[12,4.2,8]),part('机库顶','box','roof',[-14,4.36,8],[12.5,.38,8.4]),
 part('观察塔','box','roof',[14,3.1,10],[2.1,6.2,2.1]),part('观察站','box','cabin',[14,6.4,10],[4.2,1.65,3.4]),part('观察站顶','box','roof',[14,7.32,10],[4.5,.19,3.7]),
 part('设备库','box','roof',[10,1.06,-12],[5,2.3,3.2])],
 decor:[
  part('机库识别牌','box','roof',[-14,3.67,12.035],[4.55,.72,.06]),
  part('机库标志','label','roof',[-14,3.69,12.095],[3.7,.63,1],{text:'H-24',ink:'#f5dfaa'}),
  part('观测塔天线','cylinder','frame',[14,8.03,10],[.045,1.35,.045]),
  part('观测塔示位灯','sphere','beacon',[14,8.78,10],[.13,.15,.13]),
  ...[-1,1].flatMap(side=>[0,1,2,3].map(i=>part('起降识别灯','sphere','beacon',[side*(4.2+i*.22),.16,side*(3.9-i*.90)],[.11,.07,.11]))),
  ...[0,1,2,3,4,5].map(i=>part('机库引导标线','box','heliPaint',[-9.6+i*1.13,.018,3.1+i*.18],[.56,.027,.092],{r:[0,-.16,0]}))
 ],
 material,parts,camera:{mode:'cinema',position:[12,5,11],target:[0,1,0],fov:43,distance:11.7,angle:.58}
};
const record=bakeFlight(scene);
const source=JSON.stringify(scene,null,2);
fs.writeFileSync('assets/helicopter-24.scene',source.slice(0,-2)+',\n  "record": '+JSON.stringify(record)+'\n}\n');
