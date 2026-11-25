const cloud=(x,y,z,c)=>G(P('M0 30Q-4 16 18 15Q19 -4 40 1Q52 -22 72 -7Q88 -14 101 7Q127 1 131 19Q149 17 157 30Z',c),tr(x,y,z));
function mountains(y,col,seed,h=115){return P('M-30 690'+rep(17,j=>'L'+(j*85-40)+' '+(y-rand(j+seed)*h))+'V690Z',col)}
function hills(y,col,h=70){return P(`M-30 ${y}q150 ${-h*2} 340 -10t380 -12t380 7t260 4V680H-30Z`,col)}
function pine(x,y,z,c){return G(P('M-6 0V-49H-37L-18 -79H-32L-12 -111H-24L0 -157L25 -108H12L34 -73H22L41 -48H8V0Z',c),tr(x,y,z))}
function house(x,y,z,c,w='#f8ede1',round=false){return G(R(0,-79,87,80,w,round?'rx="16"':'')+P('M-12 -75L40 -118L100 -76Z',c)+R(33,-44,20,45,c,'rx="5"')+R(9,-57,15,18,'#86b5bc')+R(62,-57,15,18,'#86b5bc'),tr(x,y,z))}
function fence(y,col){return rep(31,i=>R(i*42-20,y-53,5,60,col))+L(0,y-40,1200,y-40,col,5)+L(0,y-13,1200,y-13,col,3)}
const road=(y,c,l)=>P(`M0 ${y+25}Q645 ${y-11} 1200 ${y-7}V675H0Z`,c)+P(`M0 ${y+38}Q645 ${y+2} 1200 ${y+6}`,'none',st(l,3));
function train(x,y,z,night,t){let b=night?'#20394f':'#d5e1dc',trim=night?'#dfbc77':'#3b8895';return G(rep(4,k=>G(R(0,0,316,117,b,`rx="12" ${st(trim,3)}`)+R(1,81,314,7,trim)+rep(7,j=>R(12+j*42,15,31,45,night?'#f8d79e':'#6c93a4','rx="6"')+ (night?nightPassenger(12+j*42,t,j):G(C(27+j*42,40,6,'#65605d')+P(`M${16+j*42} 59q0 -29 22 0Z`,'#706660'),`transform="translate(0 ${6*(1-clamp(t-1-j*.15))})"`)))+mt(110,105,'ORBIT EXPRESS',10,trim,'letter-spacing="3"')+C(45,120,13,'#263239')+C(268,120,13,'#263239'),tr(k*326,0))),tr(x,y,z))}
function petals(n,t,c){return rep(n,i=>{let x=((rand(i)*1310+t*(12+i%13))%1310)-55,y=(rand(i+47)*620+t*(10+i%19))%610;return G(P('M0 0Q-8 -7 -2 -12Q5 -13 4 -19Q16 -7 0 0Z',c),tr(x,y,.28+rand(i+18)*.65,t*24+i*39))})}

function school(y){return G(R(0,0,490,158,'#eae9df')+R(0,4,490,10,'#b5cad0')+rep(3,k=>rep(13,j=>R(10+j*37,21+k*45,24,24,'#91b4c3')+R(12+j*37,23+k*45,9,20,'#a8cdd4')))+R(184,-30,119,189,'#f4f3e9')+P('M171 -29L241 -71L313 -29Z','#85a4af')+C(243,-12,14,'#fff',st('#718b90',2))+P('M242 -21v10l7 2','none',st('#718b90',2))+R(221,102,44,56,'#8facae'),tr(592,y))}
function windows(x,y,w,h,n,m,c){return rep(n*m,i=>R(x+i%n*w/n,y+Math.floor(i/n)*h/m,w/n*.55,h/m*.53,c))}
function embellish(i,t,x,y){
let s='',front='',signal=clamp((t-1.7)*2.5);
switch(i){
case 1:s+=G(P('M0 12L13 0h177l13 12l-13 20H13Z','#253348',st('#d9bc84',1.8))+mt(101,20,'LYRA   •   天琴座',14,'#ffe0a4','text-anchor="middle"'),tr(142,205))+rep(4,j=>G(P('M0 0q94 -39 161 -7','none',st('#9ba7ac',.8))+C(34,-11,2,'#e5c68c'),tr(280+j*123,161+j%2*38,.7)));break;
case 2:s+=rep(4,j=>G(P('M0 71V0H103L79 6H35L13 27V55Z','#ccaa67')+P('M10 61V10H78L48 16L28 35Z','none',st('#f9d58c',1.8))+star(16,16,7,'#f7e1a4'),`transform="translate(${j%2?1185:15} ${j>1?660:15}) scale(${j%2?-1:1} ${j>1?-1:1})"`))+rep(3,j=>G(C(0,0,17,'#3b5f64',st('#f1d98d',2))+star(0,0,10,['#f09966','#a6dbd3','#bfc98a'][j],3+j),tr(1046+j*46,56)));break;
case 3:s+=rep(6,j=>L(70+j*11,572,135+j*11,559,'#e8efea',3));break;
case 5:s+=rep(5,j=>G(P('M0 0v-63','none',st('#d5b897',5))+C(0,-70,23,['#eaa3b1','#b3c7e1','#d3b6d9'][j%3],st('#ffeace',3))+P('M0 -70q-4 -7 3 -8q13 1 9 13q-5 15 -21 4q-12 -10 -1 -22','none',st('#fff1d4',4)),tr(43+j*260,492,.7+rand(j)*.36)));break;
case 6:s+=rep(4,j=>G(star(0,0,32+6*Math.cos(t*pi*2+j),'#ffedb3',5)+rep(3,k=>L(-47,48+k*6,47,48+k*6,'#ffeecf',1)),tr(354+j*169,192)))+rep(15,j=>C(j*90,431,3+(j%2),'#ffe4d4'));break;
case 8:s+=C(1001,88,64,'#fffae0','opacity=".15"')+C(1001,88,34,'#ffffe8','opacity=".63"')+rep(8,j=>G(P('M0 0l-9 340h22Z','#fffae0','opacity=".09"'),tr(1002,88,1,9+j*9)));break;
case 10:s+=G(R(0,0,116,46,'#2e3939')+mt(9,18,'SYS.  071',13,'#e6c55d')+rep(12,j=>R(10+j*8,26,5,9,j<(t*3)%12?'#e3c45d':'#637069')),tr(316,201))+G(R(-21,-7,42,9,'#46504d')+P('M-14 -8v-12q14 -21 28 0v12Z',Math.floor(t*5)%2?'#ffdc60':'#bd9242'),tr(773,251));break;
case 11:{let col='#cde7f7';s+=G(rep(4,j=>G(C(0,0,15-j*2,'none',st(col,1.3))+C(0,0,5,'none',st(col,1))+L(0,-20,0,21,col,.5),tr(j*(19+6*signal),0)))+P('M-20 0h125','none','stroke="#a0d4f1" stroke-dasharray="4 4"'),tr(901,553));break}
case 12:s+=rep(3,j=>G(P('M-8 2q5 -11 12 -3q9 -7 15 0q-10 -1 -15 5q-5 -5 -12 -2Z','#686e60'),tr(509+j*39,127+j%2*17,.66+j*.12)))+G(R(0,0,34,67,'#a35742')+T(17,29,'山',20,'#e6dac7','text-anchor="middle"')+T(17,54,'行',20,'#e6dac7','text-anchor="middle"'),tr(1064,103));break;
case 13:s+=shorePrint();break;
case 15:s+=willowCanopy(t);front+=pondGlints(t)+rep(80,j=>G(P('M0 0q3 -11 14 -6q6 7 -5 7Z',['#ba9db0','#efc0ca','#e1d0a8','#afbc91'][j%4]),tr(j<40?rand(j)*245:957+rand(j)*245,555+rand(j+53)*115,.65+rand(j+78))));break;
case 17:s+=G(R(0,0,71,67,'#efd994',st('#4c4150',3))+star(36,31,23,'#473c4d',5)+mt(10,59,'CLUB  / 18',8,'#4c4150'),tr(107,400,1,-16));break;
case 20:s+=rep(4,j=>G(P('M0 0l10 -19l11 19l-10 25Z','#dcd1dc')+P('M10 -19l11 19h-11Z','#fff1e8')+P('M11 25l10 -25H10Z','#b49abc'),tr(174+j*107,220+17*Math.sin(t+j),.55+rand(j)*.7)));break;
}
return [s,front]}
function titleCard(i,t,bg){
let n=n2(i+1),en=EN[i].toUpperCase(),text=CN[i],c=palettes[i][1];
if(i===16&&t>3.25&&t<5.15)return G(R(0,0,256,47,'#fff0bf',st(ink,4))+T(13,31,text,24,ink,'font-weight="900"')+mt(129,30,'16 / POP ART',16,ink),tr(472,314,1,-3));
if(i===1)return G(P('M0 12l12 -12h329l12 12v53l-12 12H12L0 65Z','#203445',st('#c7a875',1.7))+P('M7 15l9 -9h322l8 9v46l-8 9H16l-9 -9Z','none',st('#8f8265',.8))+star(29,38,11,'#eaca8f')+mt(51,29,'PL. 02   /   INTERSTELLAR RAILWAY',12,'#d4b781','letter-spacing="1"')+T(50,58,text,27,'#f0dfb7','font-weight="bold"'),tr(36,33));
if(i===9)return G(mt(0,0,'Nº X   /   RETRO OCCULT PRINT',13,'#605741','letter-spacing="1"')+T(0,35,CN[9],27,'#494536','style="font-family:SimSun,serif" font-weight="bold"'),tr(38,199));
if(i===11)return G(R(0,0,364,67,'#285989',st('#c8e3f4',1.3))+L(47,0,47,67,'#c8e3f4')+mt(10,41,n,22,'#d7f1ff')+mt(61,23,en+'   /   A01',13,'#c6deed')+T(59,53,text,25,'#e0f2ff'),tr(36,43));
if(i===12||i===13)return G(R(0,0,51,165,i===13?'#f3dec1':'#e4e0cb',st(c,1.5))+rep(text.length,j=>T(25,31+j*28,text[j],24,c,'text-anchor="middle" style="font-family:KaiTi,SimSun,serif"'))+mt(65,24,en,14,c,'letter-spacing="2"')+mt(65,47,'PLATE '+n,12,c),tr(39,38));
if(i===2)return G(P('M0 0H366l-17 32l10 31H0Z','#36565a',st('#ebcd80',2))+star(24,31,12,'#e7ce85')+mt(49,22,en,14,'#edcf85','letter-spacing="2"')+T(48,53,text,26,'#fff0c2'),tr(36,35));
if(i===3||i===4||i===5)return G(R(0,0,316,78,'#fffaf1','opacity=".86" rx="16"')+C(21,23,4,i===3?'#6dadc0':'#c18b9e')+mt(35,28,'0'+n+'  /  '+en,13,bg,'letter-spacing="1"')+T(17,59,text,27,bg,'font-weight="bold"'),tr(37,33));
if(i===18)return G(R(6,6,293,70,'#4c716d')+R(0,0,293,70,'#f1ead0',st('#3d585a',4))+mt(15,25,'STAGE '+n+'    '+en,16,'#50726c')+T(15,56,text,25,'#304e4d','font-weight="bold"'),tr(40,37));
if(i===20||i===21)return G(R(5,5,308,76,'#645779')+R(0,0,308,76,'#e8dbea',st('#746886',2))+R(3,3,302,23,'#877ca1')+mt(12,20,en+'.EXE',14,'#fff')+mt(272,20,'– ×',14,'#fff')+T(12,60,text,28,'#625471','font-weight="bold"'),tr(i===21?36+Math.floor(t*6)%3*3:36,35));
return G(R(0,0,328,77,bg,'rx="2" opacity=".94"')+R(0,0,4,77,palettes[i][2])+mt(16,24,'PL. '+n+'   /   '+en,14,'#f3e9d4','letter-spacing="1"')+T(15,58,text,28,'#fff4de','font-weight="bold"'),tr(37,32))}

function digitalSky(){
let s=R(0,0,1200,675,'url(#digiSky)')+'<defs>'+grad('digiSky',['#3a7ec2','#82c5df','#e4eddd'])+grad('cumulus',['#fffff5','#eef3ed','#b3c9d0','#9eb7ca'])+grad('veil',['#dbe9ea','#b8d5dd'])+'</defs>';
const column=(x,y,z)=>G(P('M-125 120Q-140 98 -103 86Q-119 62 -85 59Q-98 34 -64 32Q-67 14 -47 8Q-55 -19 -27 -26Q-36 -59 -5 -66Q-14 -103 19 -108Q38 -123 52 -97Q79 -109 85 -83Q110 -70 91 -49Q125 -43 113 -21Q153 -21 145 11Q173 28 151 44Q197 47 185 71Q221 90 197 103Q238 107 242 128Z','url(#cumulus)')+rep(35,j=>{let yy=rand(j+33)*160-63,xx=33+(rand(j)-.5)*(55+(yy+63)*.72);return C(xx,yy,7+rand(j+700)*17,j%3?'#fffef5':'#dce8e7','opacity="'+(.16+rand(j+14)*.23)+'"')}),tr(x,y,z));
s+=column(787,155,1.35)+column(631,202,.92)+column(184,143,.51)+rep(9,j=>cloud(j*145,250+rand(j)*17,.6,'#f1f5ed'))+P('M0 181Q338 128 621 43','none',st('#e9f3f4',2,''));
return s}
function inkPeaks(seed,base,col,scale){let s='';for(let j=0;j<9;j++){let xx=j*163-35,ht=(79+rand(j+seed)*96)*scale;s+=G(P('M-138 32Q-100 7 -76 -21Q-51 -45 -39 -35Q-20 -72 -12 -70Q1 -115 13 -108Q22 -99 31 -70Q53 -61 64 -31Q88 -24 105 0L145 34Z',col)+rep(17,k=>{let q=rand(k+j*17);return P('M'+(q*56-25)+' '+(-53+q*20)+'q-14 14 -19 30l-26 23','none',st('#525f52',.6+rand(k)*1.1),'')}),`transform="translate(${xx} ${base}) scale(1.35 ${ht/105})" opacity=".68"`)}return s}


function assemblyArms(t,x,y){
 const ends=[2,2.75,3.5],targets=[[110,-72],[124,-56],[72,46]],pieces=[
 P('M-25 10Q-21 -16 5 -18Q27 -17 30 5L38 8L-27 14Z','#e6bf3d',st('#263638',2)),
 R(-15,-5,30,10,'#354d55',st('#d3bb61',1.7)),
 P('M-9 -13l13 -3l9 29l-13 4Z','#f5d451',st('#475141',1.3))];
 return rep(3,j=>{
   const dt=t-ends[j],reach=dt<0?ease((dt+.68)/.68):1-ease(dt/.46);
   const baseX=512+j*128,baseY=125;
   const endX=(baseX-12)*(1-reach)+(x+targets[j][0]*.94)*reach;
   const endY=(197+j*11)*(1-reach)+(y+targets[j][1]*.94-13)*reach;
   const midX=(baseX+endX)/2-32,midY=(baseY+endY)/2-9;
   const armPath='M'+baseX+' '+baseY+'L'+midX+' '+midY+'L'+endX+' '+endY;
   return P(armPath,'none',st('#3d4947',17))+P(armPath,'none',st('#a8aaa0',5))+
   C(baseX,baseY,15,'#687773',st('#303b38',4))+C(midX,midY,11,'#dfb548',st('#35403e',3))+
   G(P('M-6 -3l-6 12l5 4m13 -16l6 12l-5 4','none',st('#374340',4))+(dt<0?G(pieces[j],tr(0,13,.88)):''),tr(endX,endY));
 });
}
function painter(t){
 const look=Math.sin(pi*clamp((t-1.6)/1.55)),turn=16*look;
 return P('M-20 -95Q13 -91 63 -131Q114 -93 146 -95L134 -83H-10Z','#4a554b')+
 P('M0 -81v81m117 -81v81M-10 0h145','none',st('#637064',5))+
 G(C(1,-14,7,'#d2ccae',st('#586053',1))+P('M-6 -17q-4 -10 6 -10l7 9l-9 1Z','#4f594e')+C(6,-28,4,'#465044')+
 P('M-3 -14l-5 4l7 2Z','#7b7b67'),tr(55,-22-look*4,1,turn))+
 P('M43 -27q8 -10 17 -3l13 30H31Z','#747869')+
 P('M55 -22q8 11 21 6','none',st('#626e5c',5))+
 L(77,-15,80+look*4,-30,'#464c41',2)+
 P('M65 -15l44 -1l-1 20l-46 -1Z','#f2ecd6')+G(bike(-1,0,true),tr(69,-12,.082));
}
function scrollReveal(t){
 const open=ease((t-2.9)/.52)*(1-ease((t-4.45)/.45));
 if(open<=0)return '';
 const w=305*open,left=827+(305-w)/2;
 return G(P('M16 0q119 12 263 0v163q-145 -12 -263 0Z','#ece5ce')+
 G(bike(12,1.5),tr(75,49,.34))+
 R(20,17,23,51,'#99583f')+T(32,38,'已',16,'#f8e5cc','text-anchor="middle"')+T(32,60,'至',16,'#f8e5cc','text-anchor="middle"')+
 P('M16 -5v174m265 -174v174','none',st('#6e6952',9))+
 P('M14 -5v174m265 -174v174','none',st('#bbb395',2)),`transform="translate(${left} 382) scale(${open} 1) rotate(-4 145 80)"`);
}
const tagLines=[
 'M4 77Q34 26 61 9Q37 45 17 83',
 'M18 59Q71 50 88 18Q91 1 69 4Q37 11 12 40',
 'M47 67Q70 42 80 48Q83 59 59 66Q64 82 89 61Q112 39 124 18Q101 47 91 69Q87 88 110 70L129 50Q108 80 127 73L157 57Q173 51 165 65L208 32'
];
function measureStroke(d){
 const path=document.createElementNS('http://www.w3.org/2000/svg','path');
 path.setAttribute('d',d);return {d,path,length:path.getTotalLength()};
}
const signatureSegments=tagLines.map(measureStroke);
const signatureLength=signatureSegments.reduce((sum,s)=>sum+s.length,0);
const correctionMark=measureStroke('M960 158Q1021 274 957 318Q914 352 826 353L851 335M826 353L852 365');
function markerStroke(segment,progress,colour,width){
 if(progress<=0)return '';
 return P(segment.d,'none',st(colour,width)+' pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="'+(1-progress)+'"');
}
function spraying(t,x,y,z){
 const progress=clamp((t-.8)/2.25),correction=clamp((t-3.55)/1.02);
 let left=signatureLength*progress,inked='',tip=signatureSegments[0].path.getPointAtLength(0);
 for(const stroke of signatureSegments){
  const q=clamp(left/stroke.length);
  inked+=markerStroke(stroke,q,'#483346',9)+markerStroke(stroke,q,'#efaccb',4.8);
  if(left>=0)tip=stroke.path.getPointAtLength(stroke.length*q);
  left-=stroke.length;
 }
 const rad=-6*pi/180;
 let endX=730+1.1*(tip.x*Math.cos(rad)-tip.y*Math.sin(rad));
 let endY=142+1.1*(tip.x*Math.sin(rad)+tip.y*Math.cos(rad));
 let wall=G(inked,tr(730,142,1.1,-6));
 if(progress===1)wall+=rep(23,j=>C(endX+rand(j)*12-2,endY+rand(j+44)*17-4,1+rand(j+28)*2,'#efaccb'))+
 P('M'+(endX+4)+' '+(endY+4)+'v'+(3+15*clamp((t-3.05)/1.2)),'none',st('#edb4cf',3));
 wall+=markerStroke(correctionMark,correction,'#454143',10)+markerStroke(correctionMark,correction,'#e4ef9d',5.5);
 if(correction>0){const tip=correctionMark.path.getPointAtLength(correctionMark.length*correction);endX=tip.x;endY=tip.y}
 const firing=(progress>0&&progress<1)||(correction>0&&correction<1);
 let action='';
 if(firing){
  const nozzleX=Math.min(x+180*z,endX-11),nozzleY=Math.max(y-44*z,endY+11);
  action+=P('M'+(x+66*z)+' '+(y+41*z)+'Q'+(x+100*z)+' '+(nozzleY+38)+' '+(nozzleX-4)+' '+(nozzleY+14),'none',st('#403844',6));
  action+=G(R(-6,1,12,25,'#a1e5d0',st('#393941',1.7))+R(-4,-3,8,6,'#f3d696')+R(-3,11,6,6,'#d982ae'),tr(nozzleX,nozzleY,1,13));
  action+=rep(39,j=>{const d=rand(j+9),noise=rand(j+Math.floor(t*18)*43);
   return C(nozzleX+(endX-nozzleX)*d+(noise-.5)*(3+d*9),nozzleY+(endY-nozzleY)*d+(rand(j+31)-.5)*(4+8*d),.5+rand(j+17)*1.1,correction>0?'#e7ed9e':'#f3adcf','opacity="'+(.4+.4*d)+'"')
  });
 }
 return [wall,action];
}

function silkscreenRider(j,t){
 const colours=[palettes[16],['#ffe6a0',ink,'#e7594b','#e777ae','#e65e54'],['#82d3c4',ink,'#efcc61','#5986bb','#276ca4'],['#e9a7c3',ink,'#ffeb8c','#c89453','#368c93']][j];
 return bike(16,t).replace(/#[a-f0-9]{6}/gi,c=>{let k=palettes[16].indexOf(c);return k<0?c:colours[k]});
}

function nightPassenger(x,t,j){
 const lean=ease((t-1.65-j*.14)/.43),cx=x+13+lean*3;
 return P('M'+(x+2)+' 60q-1 -13 10 -14q13 -5 20 14Z',['#816656','#5d6c6c','#8c795d'][j%3])+
 C(cx,47-lean*9,6.6,'#dec29a')+
 P('M'+(cx-7)+' '+(47-lean*9)+'q-2 -12 8 -10q8 1 7 9l-7 -3l-8 5Z','#4c4947')+
 C(cx+4,46-lean*9,1.2,'#433937')+
 (j%2===0?G(P('M0 0q4 -2 6 -8','none',st('#d4b28d',3)),tr(cx+4,53,lean)):'');
}
function campusCrowd(t){
 return rep(9,j=>{
   const exit=ease((t-.55-j*.085)/1.36),walk=t*9+j,raise=ease((t-2)/.21);
   const x=839+(112+j*58-839)*exit,y=379+(78+(j%3)*11)*exit;
   const shirt=['#f6f5eb','#dae8ec','#f2e5d3'][j%3],skirt=j%2?'#58758a':'#536478';
   const step=(1-raise)*7*Math.sin(walk);
   return G(P('M-7 -9l'+(-3-step)+' 31m17 -32l'+(4+step)+' 30','none',st('#525d6b',5))+
    P('M-10 -36q7 -9 19 -2l8 31h-32Z',shirt,st('#879aa2',1.3))+
    P('M-12 -10h26l4 13h-34Z',skirt)+P('M-7 -36l7 12l8 -13l-9 6Z','#67869b')+
    C(0,-49,9,'#edc6a5')+P('M-10 -49q-3 -15 10 -14q14 2 10 15l-4 -6l-6 4l-2 -5Z','#495360')+
    G(P('M0 0l10 11l7 -2','none',st('#dbb79d',4))+R(13,1,8,13,'#354c5c','rx="2"')+
     R(14,3,5,8,'#afdbe4')+(raise===1&&t<2.5&&j%2===0?star(18,2,7,'#fffbe9'):''),
     'transform="translate(8 -31) rotate('+(-90*raise)+')"'),tr(x,y,.42+.4*exit));
 });
}


function willowCanopy(t){
 const leaf=['#859777','#91a57f','#b4bc8e','#d8cf9e','#94ab8d','#a7b6a1'];
 let stems=P('M-20 54Q83 66 171 0M-15 59Q104 108 225 52','none',st('#7f876e',8));
 for(let j=0;j<26;j++){
   const x=10+j*9,bend=15*Math.sin(t*.7+j*.7),top=39+24*Math.sin(j*.14),len=43+63*rand(j+374);
   stems+=P('M'+x+' '+top+'q'+(18+bend)+' '+len*.45+' '+bend+' '+len,'none',st('#9ea58b',1.1));
   for(let k=0;k<9;k++){
     const u=k/8,px=x+36*u*(1-u)+bend*u,py=top+len*u;
     stems+=G(P('M0 0q-11 4 -13 16q10 -3 13 -16Z',leaf[(j+k)%leaf.length]),tr(px,py,.55+rand(j*9+k)*.4,k%2?10:-24));
   }
 }
 return G(stems,'opacity=".88"')+rep(65,j=>G(P('M0 0q9 -5 18 0q-11 6 -18 0Z',leaf[(j+2)%leaf.length]),
 tr(920+rand(j+84)*305,20+rand(j+163)*79,.57+rand(j)*.6,12+j%32)));
}
function pondGlints(t){
 return rep(62,j=>{
  const x=95+rand(j+83)*1000+4*Math.sin(t+j*.5),y=512+rand(j+72)*151;
  return P('M'+x+' '+y+'q11 -2 26 0l-12 1.5Z',j%4?'#c5cfad':'#eee1bb','opacity=".67"');
 });
}
function rhythmTrack(t,x,y,z){
 const hitY=543,farY=324,lanes=[1,3,0,2,1,3,2,0,1,3],beat=t*2;
 function px(lane,depth){return 615+(lane-1.5)*(23+177*depth)}
 let floor=P('M569 324h92l354 275H216Z','#544874','opacity=".72"');
 for(let j=0;j<5;j++)floor+=L(px(j-.5,0),farY,px(j-.5,1.22),592,'#ba9ac9',2.5);
 floor+=L(px(-.5,1),hitY,px(3.5,1),hitY,'#f9e7f1',4);
 let overlay='';
 for(let j=0;j<4;j++)floor+=G(P('M-35 0l12 -8h46l12 8l-12 8h-46Z','#54445e',st(j%2?'#f3a0d0':'#89f0eb',2)),tr(px(j,1),hitY));
 for(let n=0;n<lanes.length;n++){
  const age=beat-n,lane=lanes[n],colour=n%2?'#fb93c9':'#8ef6ed',miss=n===9;
  if(age<0&&age>=-3||miss&&age>=0&&age<.5){
   const depth=((age+3)/3)**1.6;
   floor+=G(P('M-34 0l11 -9h47l10 9l-10 8h-48Z',colour,st('#fff2e5',2))+
   L(-18,-2,17,-2,'#fff9ec',2),tr(px(lane,depth),farY+(hitY-farY)*depth,.22+.78*depth));
  }
  if(age>=0&&age<.64&&!miss){
   const alpha=1-age/.64;
   overlay+=G(rep(6,j=>G(P('M0 0l-3 -7l3 -6l3 6Z',colour),tr(Math.cos(j*pi/3)*(10+age*65),Math.sin(j*pi/3)*(6+age*32),alpha,j*60))),
     tr(px(lane,1),hitY)+' opacity="'+alpha+'"');
  }
 }
 const flash=beat%1,slot=Math.floor(beat);
 if(slot<9&&flash<.48){
  const footX=x+(84+19*Math.cos(t*2*pi))*z,footY=y+(157+19*Math.sin(t*2*pi))*z;
  const hitX=px(lanes[slot],1),colour=slot%2?'#ffc6e6':'#c8fff5';
  overlay+=G(P('M'+footX+' '+footY+'Q'+(footX+16)+' '+(hitY-32)+' '+hitX+' '+hitY,'none',
    'stroke="'+colour+'" stroke-width="2" stroke-dasharray="4 7"')+
    star(footX,footY,10-flash*8,colour)+C(footX,footY,5+flash*19,'none',st(colour,1.3)),
    'opacity="'+(1-flash/.48)+'"');
 }
 const count=Math.min(45,37+Math.floor(beat)),failed=beat>=9;
 const label=failed?'MISS':'PERFECT',pulse=1-(beat%1);
 overlay+=mt(908,137,'COMBO',18,'#eebedb','letter-spacing="5"')+
 mt(900,203,failed?'00':String(count),66,'#fffae7','font-weight="bold"')+
 mt(904,239,'SCORE '+String(36000+(count-36)*480).padStart(6,'0'),16,'#b2e9ea');
 if(t>=1.5&&t<5.28)overlay+=G(T(0,0,label,failed?48:45,failed?'#ff94ba':'#fff4b8','font-weight="900" text-anchor="middle"')+
 rep(failed?0:3,j=>star(-82+j*85,12,3+pulse*3,'#ffdeab')),tr(957,355,1+pulse*.09,failed?5:-7));
 return [floor,overlay];
}
function signalRider(shape,t){
 const key='signal'+Math.round(t*600),id=key+'-body';
 const dye=col=>shape.replace(/((?:fill|stroke)=")#[a-f0-9]{3,6}"/gi,(_,attr)=>attr+col+'"');
 const defs='<defs><g id="'+id+'">'+shape+'</g><g id="'+key+'r">'+dye('#ff317e')+'</g><g id="'+key+'b">'+dye('#00e8ed')+'</g></defs>';
 const sliceHeight=18,frame=Math.floor(t*10),surge=frame%8===0?2.4:1;
 const strips=rep(19,j=>{
  const dy=-83+j*sliceHeight,shift=(Math.floor(rand(j+frame)*5)-2)*1.7*surge;
  const body='<use href="#'+id+'"/>';
  return '<svg x="'+(-57+shift)+'" y="'+dy+'" width="327" height="'+sliceHeight+'" viewBox="-57 '+dy+' 327 '+sliceHeight+'">'+
   '<use href="#'+key+'r" transform="translate(-5 0)"/>'+
   '<use href="#'+key+'b" transform="translate(5 0)"/>'+body+'</svg>';
 });
 return defs+strips;
}
function renderFault(t){
 const windowX=445,windowY=136,w=600;
 let packet=R(5,6,w,256,'#5d2852')+R(0,0,w,256,'#cbd6cf',st('#e782aa',3))+
 R(4,4,w-8,31,'#53475f')+mt(15,26,'render.sys    /    exception 0x0016',15,'#f1e4ef')+
 R(13,48,268,194,'#243b43')+R(13,48,268,194,'url(#scan)','opacity=".38"')+
 rep(6,j=>L(17,59+j*31,277,59+j*31,'#426261',.8))+
 T(301,113,'鹈鹕无法渲染',32,'#402f45','font-weight="bold"')+
 mt(304,148,'FRAME BUFFER  22',14,'#60526a','letter-spacing="1"')+
 R(305,170,237,8,'#a1aca7')+R(305,170,237*ease((t-2.95)/1.5),8,'#497c70')+
 mt(304,209,t<3?'[ HALTED ]':t<4.5?'[ RECOVERING ]':'[ RESTORED ]',14,'#415e55');
 return G(packet,tr(windowX,windowY));
}

function eveningEdition(t,liftType=false){
 const stock='#e7dcc0',type='#494536',serif='style="font-family:Georgia,SimSun,serif"';
 const rule=(y,width=1)=>L(29,y,1171,y,type,width);
 let page=R(0,0,1200,675,stock)+rule(25,3)+rule(31);
 page+=T(600,110,'The Evening Oracle',85,type,serif+' text-anchor="middle" font-weight="bold"')+
 G(C(0,0,30,'none',st(type,1.2))+C(0,0,23,'none',st(type,.8))+star(0,0,19,type,8),tr(99,78))+
 mt(1078,71,'PRICE',12,type,'text-anchor="middle" letter-spacing="3"')+T(1078,99,'5¢',31,type,serif+' text-anchor="middle"')+
 rule(124,4)+rule(131)+mt(42,154,'VOL. XXII     •     ILLUSTRATED EVENING EDITION',14,type)+
 mt(1158,154,'ISSUE Nº 010    /    CITY DESK',14,type,'text-anchor="end"')+rule(167);
 // The picture and all its scene geometry stay inside the photographic mount.
 const exposure=ease((t-1.2)/2.35);
 const photo=graphicWindow(0,0,614,344,sepia(stockExposure(false)+opacity(stockExposure(true),exposure),1,'newsprint-silver'),'0 68 1200 515')+
 R(0,0,614,344,'url(#dots)','opacity=".16"');
 page+=R(323,183,628,358,'none',st(type,2))+
 '<svg x="330" y="190" width="614" height="344" viewBox="0 0 614 344">'+photo+R(0,0,614,344,'#e0d4b7','opacity="'+(.50*(1-exposure))+'"')+'</svg>'+
 mt(326,558,'FIG. 01   /   银盐相纸    ·    两轮车上的异鸟',14,type)+L(323,570,951,570,type,1);
 const roundel=C(0,0,103,'none',st(type,1.4))+rep(4,j=>C(0,0,25+j*20,'none',st('#897e63',.8)))+
 rep(60,j=>G(L(0,-101,0,j%5?-96:-91,type,j%5?.8:1.6),tr(0,0,1,j*6)))+
 rep(3,j=>G(P('M0 -85L74 42L-74 42Z','none',st('#746c54',1)),tr(0,0,1,j*40+t*1.8)))+
 star(0,0,18,'#776948',8);
 page+=G(roundel,tr(161,365))+mt(161,490,'TAB. X    /    ASTRAL DIAL',13,type,'text-anchor="middle"')+
 L(306,183,306,573,type,1)+L(968,183,968,573,type,1)+
 T(989,216,'目击手记',25,type,serif+' font-weight="bold"')+L(988,227,1158,227,type,1)+
 ['黄昏，街角传来铃声。','行客驻足，见一长喙鸟','骑车穿过街心。','镜头开合之间，','飞轮犹染银盐。'].map((line,j)=>liftType&&j<2?'':T(990,259+j*31,line,17,type,serif)).join('')+
 mt(989,441,'FIELD NOTES / 10',12,type,'letter-spacing="1"')+
 G(C(0,0,38,'none',st('#985f49',2.4))+C(0,0,31,'none',st('#985f49',.9))+star(0,-10,11,'#985f49',6)+mt(0,15,'FILED',11,'#985f49','text-anchor="middle" letter-spacing="2"'),tr(1074,510,1,-11));
 const headline='骑行异闻：长喙来客现身街头',letters=clamp((t-1.45)/1.4)*headline.length;
 page+=(liftType?'':T(38,621,headline.slice(0,Math.ceil(letters)),41,type,serif+' font-weight="bold"'))+
 mt(1156,610,'SPECIAL DISPATCH',16,type,'text-anchor="end" letter-spacing="2"')+rule(637,2)+
 R(774,0,4,675,'#8e8369','opacity=".12"')+R(778,0,2,675,'#fff9df','opacity=".42"');
 return page;
}
function developmentWash(t){
 const travel=clamp((t-1.15)/2.1),alpha=Math.sin(travel*pi);
 if(alpha<=.001)return '';
 const level=342*(1-travel);
 return '<svg x="330" y="190" width="614" height="344" viewBox="0 0 614 344">'+
 P('M0 '+level+'q88 -18 166 -4t174 -3t165 1t140 -6v22q-84 -8 -146 2t-175 -2t-169 3t-155 0Z','#eadbbd','opacity="'+(.38*alpha)+'"')+
 L(0,level+12,614,level+6,'#f1e6cf',1,'opacity="'+(.45*alpha)+'"')+'</svg>';
}
function drawingSpread(t){return ease((t-1.55)/.78)*(1-ease((t-3.8)/.72))}
function wheelDimension(t){
 const spread=34*drawingSpread(t),left=-spread,right=203+spread,y=267+8*drawingSpread(t),col='#d3eaff';
 return L(left,y-23,left,y+8,col,1)+L(right,y-23,right,y+8,col,1)+L(left,y,right,y,col,1)+
 P('M'+left+' '+y+'l8 -3v6Z',col)+P('M'+right+' '+y+'l-8 -3v6Z',col)+
 R(58,y-12,87,17,'#255485')+mt(101.5,y+1,(right-left).toFixed(1)+' mm',12,col,'text-anchor="middle"');
}
function printWave(t){
 const crest=ease((t-.65)/1.35)*(1-ease((t-3.55)/1.06)),key='#253f50',foam='#fbf2d9';
 let body=P('M-74 340C25 320 91 257 134 133C171 24 222 -21 296 -24C363 -28 414 3 442 59C406 33 377 36 351 51C305 79 284 141 312 187C339 232 414 265 510 281C358 338 151 370 -74 340Z','#315d76',st(key,2.5));
 body+=P('M-41 332C89 290 108 201 147 115C181 42 230 0 270 -3C209 28 177 87 153 161C117 272 64 311 -41 332Z','#779ca9')+
 P('M72 337C166 256 170 154 209 86C235 38 280 10 320 13C268 23 242 59 218 115C183 200 173 292 72 337Z','#57849b')+
 P('M182 335C248 259 226 176 254 104C272 58 299 34 345 28C296 49 279 84 274 127C267 193 291 275 182 335Z','#8ba6ac')+
 P('M253 328C287 290 303 253 293 212C313 255 356 275 430 292C361 292 307 298 253 328Z','#6d8d98');
 for(let j=0;j<15;j++){
   const a=j*7.1;
   body+=P('M'+(-29+a)+' '+(327+j%3*4)+'C'+(87+a)+' 286 '+(112+a*.59)+' 144 '+(145+a*.49)+' 91Q'+(182+a*.53)+' 23 '+(228+a*.72)+' '+(11+j*.4),
    'none',st(j%4?'#9cb1b0':'#dfd6b9',j%4?1.65:3.2));
 }
 body+=P('M144 111C172 26 221 -39 300 -42C365 -45 417 -8 440 39Q454 55 456 74Q449 64 443 65Q448 76 439 80Q438 65 432 65Q424 63 428 74Q423 71 418 64Q412 51 406 54Q401 58 407 67Q394 63 390 51Q386 45 381 49Q379 55 382 62Q372 61 369 54Q361 48 356 55Q346 66 346 76Q339 60 346 47Q330 44 316 62Q313 68 309 76Q307 61 311 53Q292 55 276 81Q277 64 283 54Q265 57 245 86L244 73Q228 81 215 102L217 83Q196 96 180 121L185 99Q163 111 148 136Z',foam,st(key,1.5));
 body+=rep(13,j=>{let x=193+j*16,y=30-53*Math.sin((j+.5)*pi/15);
  return G(P('M0 0q5 -9 13 -8q-8 6 -9 12q6 -5 12 -4','none',st('#749098',1.3)),tr(x,y, .7+rand(j)*.55,j*4-29))});
 body+=rep(23,j=>{const a=j/22,px=198+a*217,py=60-79*Math.sin(a*pi)+6*Math.sin(j*1.63);
  return G(P('M0 3q4 -10 11 -9q-6 5 -6 10q5 -5 10 -3','none',st(j%3?'#9cafad':'#638694',1.2)),tr(px,py,.6+rand(j+81)*.39,j*3-32))});
 body+=rep(53,j=>{let a=rand(j+51)*pi,r=78+rand(j+84)*62;return G(P('M0 3q-4 -5 0 -8q5 2 4 6Z',foam,st('#768c90',.6)),tr(298+Math.cos(a)*r,22-Math.sin(a)*r*.71,.49+rand(j)*.68,j*11))});
 return G(body,tr(38+8*crest,185-57*crest,1.28));
}
function shorePrint(){
 let branch=P('M1220 42Q1151 40 1113 71Q1090 85 1053 77Q1019 73 997 86Q1031 65 1056 69Q1102 75 1122 53Q1139 35 1161 21L1169 0H1180L1175 26Q1198 23 1220 26Z','#55575a')+
 P('M1118 65q-18 -21 -39 -26m15 6q-4 -17 -10 -23m-17 51q-24 -17 -47 -14','none',st('#55575a',2.2));
 const clusters=[[1017,72],[1052,68],[1078,40],[1094,43],[1111,71],[1140,42],[1161,26],[1190,26]];
 for(const [k,pos] of clusters.entries())branch+=rep(4,j=>G(rep(5,n=>G(P('M0 1q-6 -4 -4 -10l3 2l2 -3q6 6 -1 11Z',j%2?'#eac3b1':'#dcac9f',st('#a77e72',.6)),tr(0,0,1,n*72)))+C(0,0,1.2,'#b69060'),tr(pos[0]+rand(k*8+j)*18-9,pos[1]+rand(k+j+70)*16-8,.46+rand(k+j+22)*.39,j*29)));
 const skiff=G(P('M-3 6Q38 15 102 -4Q96 13 72 17Q31 23 -3 6Z','#a2997c',st('#4e666b',1.3))+P('M21 7l15 -17l35 -1l12 12Z','#789091',st('#426271',1))+rep(4,j=>L(30+j*12,8,43+j*12,-11,'#e4d8b7',1.1)),tr(926,367,.81));
 return skiff+branch;
}
function blueprintProjections(){
 const col='#d3eafa',thin=st(col,1.4),centre='stroke="#b4cee9" stroke-width=".8" stroke-dasharray="6 3 1 3"';
 const front=P('M0 -58V73M-46 18H46','none',centre)+
 P('M-24 -3Q-28 -22 -12 -26Q-2 -27 -4 -39Q-8 -53 1 -55Q10 -58 13 -48L8 -34L3 -31Q11 -6 23 -2Q18 11 4 14Q-15 13 -24 -3Z','none',thin)+
 P('M0 -47l7 -2l-2 23l-5 5Z','none',thin)+C(-3,-47,1.4,col)+C(9,-47,1.4,col)+
 P('M-22 -6q8 -7 15 4M11 -7q7 2 11 5M-9 12l-8 15l3 17h8m14 -33l10 15l-3 24h-8M-29 7l5 8h45l7 -7M-4 17v39m8 -39v39','none',thin)+
 R(-4,36,8,39,'none','rx="4" '+thin)+L(-15,44,0,44,col,2)+L(0,49,17,49,col,2);
 const top=P('M-58 0H68M0 -40V40','none',centre)+
 R(-53,-2,33,4,'none','rx="2" '+thin)+R(36,-2,32,4,'none','rx="2" '+thin)+
 P('M-42 0Q-13 -27 10 -16Q20 -13 22 -6Q25 -3 31 -7Q42 -11 44 -2L64 0l-20 2q-2 6 -14 6q-8 1 -12 5Q-4 26 -42 0Z','none',thin)+
 P('M-34 -2q16 -16 35 -12q-8 10 -35 12Zm0 4q15 13 34 12q-17 -11 -34 -12ZM32 -20v40m-6 -40h9m-9 40h9','none',thin);
 return G(mt(-34,-76,'B / FRONT',12,col)+front,tr(91,534,.93))+
 G(mt(-47,-76,'C / TOP',12,col)+top,tr(232,534,.93))+
 L(39,443,296,443,'#91b5d7',.9)+L(165,456,165,614,'#91b5d7',.7);
}
function sweetHouse(x,y,z,flavour,bakery=false){
 const icing=['#dc91ac','#d3ac7e','#aaa1ca','#81b7b2'][flavour%4],outline='#ae8a8e';
 let h=R(0,-113,134,115,'#fff0d3','rx="25" '+st(outline,2.2))+
 P('M-8 -97Q-10 -135 19 -151Q36 -178 69 -167Q111 -176 131 -140Q146 -120 142 -98Q134 -82 122 -95Q112 -73 98 -94Q85 -82 72 -95Q54 -72 42 -92Q27 -76 16 -92Q3 -82 -8 -97Z',icing,st(outline,2.1))+
 rep(11,j=>G(R(-4,-1,9,3,j%2?'#fff1d4':'#f5cdb9','rx="1.5"'),tr(14+j*10,-122-22*Math.sin(j*.31)+rand(j+flavour)*9,1,j%2?-26:25)))+
 R(0,-12,134,14,'#e6c0a7','rx="6"');
 if(bakery){
  h+=R(9,-72,87,52,'#a7d1ca','rx="9" '+st(outline,2))+R(104,-72,23,73,'#b3c4cd','rx="11" '+st(outline,2))+
   rep(7,j=>R(6+j*13,-75,13,12,j%2?'#f7dbca':'#d7949b','rx="5"'))+
   R(11,-27,83,5,'#eac698')+rep(4,j=>G(P('M-8 0q-2 -12 8 -13q9 0 10 13Z','#f4cb80',st('#bd986b',1))+P('M-3 -8l4 3m1 -6l4 3','none',st('#c69966',1.5)),tr(23+j*18,-29)))+
   R(16,-100,103,21,'#fff1d9','rx="9"')+mt(68,-85,'BAKE HOUSE',11,'#906b74','text-anchor="middle" letter-spacing="1.2"');
 }else{
  h+=R(50,-58,35,60,icing,'rx="16" '+st(outline,2))+C(76,-26,2.5,'#f8ead4')+
  rep(2,j=>G(C(0,0,13,'#abd2d2',st('#f8dcb7',4))+P('M-10 0h20M0 -10v20','none',st('#fff1dc',2)),tr(24+j*87,-57)));
 }
 return G(h,tr(x,y,z));
}
function sugarLane(t){
 let s=R(0,0,1200,675,'#b8e6de')+rep(7,j=>G(rep(4,k=>C(k*19,-7*Math.sin(k),17+k%3*4,'#fff1dc'))+R(-8,1,75,13,'#fff1dc','rx="6"'),tr(j*225-40-t*3,128+rand(j+7)*71,.9+rand(j)*.4)))+
 hills(318,'#cbc7d9',52)+hills(371,'#adcdb5',68);
 s+=rep(8,j=>sweetHouse(j*176-48-t*7,450-j%2*11,.8+j%3*.13,j,j===2||j===6))+
 road(503,'#f1d3b6','#fff0d7')+rep(38,j=>G(P('M-4 0q0 -5 9 -5q6 0 4 3q-1 4 -13 2Z',j%3?'#dfb9a8':'#f9e4c6'),tr(j*38-t*21%38,562+rand(j+4)*86,1,j%4*9)));
 return s;
}
function celCloud(x,y,z){
 return G(P('M-8 58Q-8 40 12 39Q7 26 23 23Q26 5 46 10Q51 -9 73 -5Q88 -29 111 -18Q133 -35 152 -11Q172 -15 181 4Q201 2 211 17Q229 13 237 31Q260 27 267 47Q277 48 280 57Z','#f5f5df')+
 P('M9 56Q17 42 36 46Q51 24 68 32Q88 13 107 24Q127 9 149 23Q173 16 187 35Q206 26 221 41Q247 37 262 55Z','#c5d6d1')+
 P('M63 17q12 -14 29 -10q9 -12 18 -12M161 1q11 -2 18 11','none',st('#e7ecdc',2)),tr(x,y,z));
}
function celStreet(t,travel){
 const d=travel??(64*t+148*Math.max(0,t-1.5)-148*Math.max(0,t-4.5));
 let s=R(0,0,1200,675,'#8bc6d8')+rep(5,j=>celCloud(j*291-108-d*.045,129+(j%2?15:-8),.66+rand(j)*.48))+
 mountains(303,'#a5b7ab',17,63)+city(-130-d*.09,351,.91,'#96a7a4','#c3d1bf',28);
 for(let j=0;j<15;j++){
  const x=j*172-31-(d*.62)%(172*6),y=428-x*.045;
  const col=['#d7cdb7','#d8d8c7','#c2cfd0','#dfd1b4'][j%4],roof=['#637b83','#a87f70','#7d8c81'][j%3];
  let facade=R(0,-116,136,125,col,st('#80918c',1.5))+
   P('M-9 -112L27 -139L145 -139L145 -114Z',roof,st('#687a77',2))+
   rep(10,k=>L(14+k*13,-115,36+k*12,-137,'#a4aca1',1))+R(4,-110,132,7,'#b5bcb0')+
   rep(2,k=>R(12+k*60,-87,43,36,'#8da8ac',st('#ede5cc',3))+L(33+k*60,-85,33+k*60,-51,'#e0dbbd',2))+
   P('M4 -45h129v6H4Z','#8f9992')+
   rep(15,k=>L(10+k*8,-65,10+k*8,-48,'#798986',1.6))+L(8,-65,128,-65,'#758781',2);
  if(j%3===1){facade+=R(3,-34,130,40,'#88a7a7')+R(-2,-46,142,19,'#ae695b')+
   T(69,-32,'坂 道 商 店',12,'#fff0d3','text-anchor="middle"')+rep(5,k=>L(6+k*29,-26,6+k*29,5,'#c4c2a8',2))}
  else facade+=R(51,-31,33,39,'#7c9394')+R(9,-26,28,21,'#a6b7b0')+R(101,-26,26,21,'#a6b7b0');
  s+=G(facade,tr(x,y,1.1));
 }
 s+=P('M0 443L1200 389V675H0Z','#c3b9a3')+P('M0 462L1200 408V420L0 474Z','#e9dec0')+P('M0 588L1200 534','none',st('#ece3cd',4));
 for(let j=0;j<7;j++){
  const x=j*312-46-(d*.86)%624,y=453-x*.045;
  s+=G(P('M-4 1L-8 -348L-2 -349L4 0Z','#5d7276')+
   P('M-30 -300h56M-23 -326h41','none',st('#52676c',4))+
   rep(4,k=>P('M'+(-24+k*15)+' -302q132 52 312 -14','none',st('#64767a',1.5)))+
   R(-9,-96,14,37,'#dabd81')+rep(4,k=>L(-9,-91+k*8,5,-98+k*8,'#69736d',3)),tr(x,y));
 }
 s+=rep(18,j=>{const x=(j*147-d*1.22)%1290;return L(x,608-x*.045,x+34,606-x*.045,'#ded2bc',1.8)});
 return s+R(0,0,1200,675,'url(#grain)','opacity=".045"');
}
function facetedPalm(x,y,z,lean){
 let tree=P('M-7 0L8 -92L20 -165L27 -165L21 -90L6 0Z','#736483')+
 P('M0 0L16 -92L23 -164L27 -165L21 -90L6 0Z','#a289a2');
 for(let j=0;j<8;j++){
  const blade=P('M0 0L34 -27L63 -29L98 -5L76 -11L78 -6L55 -15L56 -10L29 -13Z',j%2?'#60999f':'#528b91')+
    P('M0 0L34 -27L63 -29L98 -5L58 -21L30 -16Z',j%2?'#91c6bd':'#75b0ad');
  tree+=G(blade,tr(23,-164,1,j*36-105));
 }
 return G(tree,tr(x,y,z,lean));
}
function marbleBust(t){
 const locked=t>=2&&t<4,phase=tapeLoop(t),nod=locked?[0,6,11,3][Math.floor((phase-2)*8)%4]:2*Math.sin(phase*2*pi);
 const light='#f6e4e5',shadow='#b79db9',outline='#8b7b9b';
 const chest=P('M96 131Q99 157 77 172Q39 178 23 205Q11 219 21 231Q54 253 94 258L133 250Q175 243 196 219Q198 202 176 186L144 161L140 126Z','url(#marbleStone)',st(outline,1.7))+
 P('M137 141Q113 151 104 170L75 193L104 185L131 159L122 182L92 208L46 226Q83 223 111 207L149 166L151 155Z',shadow)+
 P('M18 212Q59 213 92 187Q76 209 44 219L71 216L39 227Z','#d0bacd')+
 rep(6,j=>P('M'+(48+j*12)+' '+(239+j*.8)+'Q'+(129+j*5)+' '+(231-j*6)+' '+(141+j*5)+' '+(177+j*2),'none',st(j%2?light:shadow,1.4)));
 let face=P('M76 68Q78 44 105 36Q136 24 152 58Q166 87 150 112L135 124L132 152Q123 171 102 169L91 156L97 133Q76 135 69 124L67 117L60 115L66 109L62 106Q60 103 65 99L56 96L65 82L68 70Z','url(#marbleStone)',st(outline,2))+
 P('M109 50Q95 59 97 75L90 87L83 91L87 97L77 107L83 114L75 122Q83 131 100 124L109 119L103 143L119 131L134 108L143 72Z','#d5bfd0')+
 P('M66 70q9 -8 20 -2l-5 4l-14 1Z','#a38ba7')+
 P('M67 79q9 -7 17 -2l-7 3Z','#917f95')+P('M67 83l-8 12l10 0M64 108l11 0M67 116l10 -2','none',st('#b299ac',1.5))+
 P('M129 89q12 -12 15 0q2 10 -9 19q4 -13 0 -10','none',st('#a18ba8',2.2));
 const locks=[[71,62],[77,48],[88,41],[102,36],[116,34],[131,40],[143,48],[151,60],[156,74],[154,90],[148,105],[139,115],[125,63],[109,54],[94,50]];
 locks.forEach(([cx,cy],j)=>{face+=G(P('M-11 1Q-16 -11 -4 -16Q11 -19 14 -5Q18 6 7 12Q-2 15 -7 8Q2 12 5 4Q6 -3 0 -4Q-8 -6 -8 3Z',j%3?'#ddc9d9':'#ecdbe2',st('#bea6bb',1.3))+P('M-8 -5q2 -8 11 -7','none',st(light,2)),tr(cx,cy,.72+rand(j)*.24,j*27))});
 return G(P('M72 250h65l3 11h-72Z','#a895b0')+R(55,259,98,11,'#d9c6d6',st(outline,1.7))+R(47,270,115,9,'#af9ab4')+
  chest+G(face,'transform="rotate('+nod+' 114 143)"'),tr(31,36));
}
function mallScene(t){
 const head=tapePosition(tapeLoop(t)),skip=t>=2&&t<4;
 let s=R(0,0,1200,675,'url(#vsky)')+C(706,217,115,'#ffe9c6')+
 rep(9,j=>R(589,224+j*12,234,2+j*.75,'#eab1cd'))+mountains(370,'#a58cae',68,101)+
 P('M0 377L195 307l118 58l128 -36l93 42l180 -65l157 48l105 -44l224 72Z','#a7a0c2')+
 R(0,378,1200,297,'#6e80a8')+rep(25,j=>L(610,355,(j-6)*132,675,'#9fdbda',1.7))+
 rep(15,j=>{const q=(j/15+head*.10)%1;return L(0,379+296*q*q,1200,379+296*q*q,'#e7a8cb',1+q*.8)})+
 rep(7,j=>facetedPalm(j<4?j*78-40:779+j%4*140,422+j%2*12,.73+rand(j)*.58,j%2?-8:6));
 const pane=R(7,9,266,337,'#766788','opacity=".42"')+R(0,0,266,337,'#d9c7d8',st('#6f6487',2.4))+
 R(4,4,258,24,'#877d9e')+mt(12,21,'MUSEUM.EXE   /   04',13,'#fff5f2')+
 R(238,8,17,15,'#d8c9db',st('#625b77',1))+mt(242,20,'×',13,'#685f79')+
 R(9,35,248,279,'#a9a7c4',st('#8b7b9b',1.2))+C(152,149,81,'#bfb6c8')+
 marbleBust(t)+R(9,315,248,15,'#e3d3df')+mt(17,326,skip?'TAPE   ↺   00:02':'STEREO    33⅓ RPM',10,'#776a85');
 s+=G(pane,tr(873,101,1.03));
 if(skip){const p=(t-2)%.5; s+=R(0,315+p*72,1200,2,'#e4c9d8','opacity=".42"')}
 return s;
}
function blossomBough(x,y,z){
 const flowers=fixedDrawing('spring-bough',()=>{
 const bark='#736170',branch=P('M-45 -31Q54 -16 124 45Q174 83 257 66Q189 97 126 68Q97 58 74 45Q98 96 157 118Q102 113 68 71Q46 42 -29 31Z',bark)+
 P('M104 47q49 8 66 -36m36 64q25 -15 53 -13M55 32q23 2 45 -25','none',st(bark,4));
 let blooms='';
 for(let j=0;j<87;j++){
  const u=rand(j+3),xx=19+u*261,yy=37+31*Math.sin(u*pi*1.18)+(rand(j+29)-.5)*69;
  const tone=['#e9b4c8','#f8d6de','#fbe8e7','#efc6d5'][j%4];
  blooms+=G(rep(5,k=>G(P('M0 0q-5 -4 -3 -8l3 1l2 -2q4 6 -2 9Z',tone),tr(0,0,1,k*72)))+C(0,0,1.15,'#d5a9a9'),tr(xx,yy,.59+rand(j+82)*.68,j*31));
 }
 return branch+blooms;});return G(flowers,tr(x,y,z));
}
function afterSchool(t){
 const move=13*t;
 const sky='<defs>'+grad('springEvening',['#bad3e4','#f0d9d9','#fff2d7'])+grad('springRoad',['#d7c8c8','#ddd3c8','#ccb9c3'])+'</defs>';
 let s=sky+R(0,0,1200,675,'url(#springEvening)')+C(920,123,76,'#fff4da','opacity=".3"')+
 rep(5,j=>cloud(j*281-104,127+rand(j)*43,.52,'#fff0e4'))+mountains(276,'#c4bfca',43,61)+
 G(city(310-move*.18,308,.73,'#bebac3','#e7ddd4',17),'opacity=".81"')+
 P('M0 344Q249 290 507 345Q759 371 1200 264V675H0Z','#beb6ad')+
 G(school(177),tr(34-move*.2,79,.8))+
 P('M0 468L1200 322V675H0Z','url(#springRoad)')+
 P('M0 453L1200 319V332L0 485Z','#b6a4ac')+P('M0 457L1200 322V326L0 467Z','#efe1d4')+
 P('M0 588L1200 378','none',st('#eee0d3',2.8));
 for(let j=0;j<12;j++){
  const x=j*133-move*.76,ground=462-x*.117,height=67-x*.026;
  s+=R(x,ground-height,8,height,'#9e969f')+
  P('M'+x+' '+(ground-height+10)+'l135 -13m-135 39l135 -15','none',st('#b5a9ad',3));
 }
 s+=rep(5,j=>floweringTree(j*267-47-move*.51,420-j*20,1.01-j*.07,13*j))+
 G(P('M0 124V-34H33v158ZM138 104V-50h29v154Z','#c4b6b6',st('#a799a4',1.7))+
 P('M-5 -33l40 -6v7l-40 6Zm139 -17l38 -6v7l-38 6Z','#e5d6ca')+
 R(9,-14,15,72,'#7a727e')+rep(4,j=>T(16,3+j*14,'桜坂学園'[j],11,'#f5e4cd','text-anchor="middle" style="font-family:SimSun,serif"'))+
 P('M35 13l101 -12v90L35 104Z','none',st('#998d96',3))+rep(12,j=>L(39+j*8,13-j,39+j*8,104-j,'#a4989f',2)),tr(897-move*.53,247))+
 rep(16,j=>P('M'+(rand(j)*1180)+' '+(421+rand(j+53)*79)+'q53 6 117 -2q-37 11 -117 2Z','#ab96aa','opacity=".18"'))+
 G(blossomBough(-53-move,-46,1.34),'opacity=".97"')+blossomBough(1015-move,-31,.94);
 return s;
}
function conversationPanel(t){
 const progress=clamp((t-1.15)/1.17),choice=t>=2.5,selected=t>=3.5,puff=0;
 const line='……那个，一起回家吗？';
 let panel=R(0,-puff*10,1102,103+puff*18,'#fff9f6','rx="'+(12+47*puff)+'" opacity=".91" '+st('#e8c6d2',1.6))+
 P('M22 75h629','none',st('#e9d7dd',1))+R(20,-15,118,28,'#b1849b','rx="10"')+
 T(80,6,'鹈鹕',17,'#fff7ef','text-anchor="middle"')+T(31,57,line.slice(0,Math.floor(progress*line.length)),27,'#6f526c')+
 (progress===1?P('M662 70h10l-5 7Z','#bf99ae'):'');
 if(choice){
  panel+=rep(2,j=>R(800,9+j*41,255,32,selected&&j?'#aa7c99':'#eee1e8','rx="16"')+
   T(927,32+j*41,['好啊','我骑车'][j],18,selected&&j?'#fff6ee':'#7f6078','text-anchor="middle"'));
  const cursorX=1018-24*ease((t-2.75)/.72),cursorY=24+41*ease((t-2.75)/.72);
  panel+=G(P('M0 0v19l5 -5l6 9l4 -2l-5 -9l8 -2Z','#fffaf1',st('#865e7d',1.7)),tr(cursorX,cursorY));
  if(selected&&t<3.87)panel+=C(994,65,5+(t-3.5)*41,'none',st('#fff5ea',1.8)+' opacity="'+(1-(t-3.5)/.37)+'"');
 }
 return G(panel,tr(49,548));
}
function commuterCar(t){
 const velocity=1545,start=1.82,xx=1250-(t-start)*velocity;
 if(t<start||xx+3*420*1.63<0)return '';
 let cars='';
 for(let j=0;j<3;j++){
  const cab=j===0,car=R(0,0,413,178,'url(#carSide)','rx="'+(cab?22:8)+'" '+st('#626f77',2.5))+
  P('M8 29h396v104H6Z','#728d97')+R(2,138,410,8,'#438591')+R(2,148,410,3,'#dcbb86')+
  rep(8,k=>G(R(0,0,37,60,'url(#commuterGlass)','rx="4" '+st('#596f79',2.8))+
   P('M1 40l34 -18v20L1 56Z','#cfe0dd','opacity=".36"')+C(19,41,5,'#647783')+
   P('M9 57q1 -16 10 -13q9 1 10 13Z','#667885')+P('M9 0v8l-3 5h7l-3 -5','none',st('#e2e4d7',1.2)),tr(10+k*50,45)))+
  rep(2,k=>G(R(0,0,47,125,'none',st('#75888e',1.8))+L(23,0,23,125,'#6b7e86',1.2),tr(98+k*200,34)))+
  R(4,163,405,12,'#829197')+rep(2,k=>G(R(-25,-5,50,12,'#43535d','rx="3"')+C(-15,8,10,'#45545d')+C(17,8,10,'#45545d'),tr(60+k*277,175)))+
  mt(224,160,'R  •  '+(204+j),7,'#e9e7dc')+L(16,19,396,19,'#f3f3e4',2.5);
  cars+=G(car,tr(j*420,0));
 }
 return '<defs>'+grad('carSide',['#d8e0db','#eff0df','#9faeb2','#c4ccca'])+grad('commuterGlass',['#8ca8ae','#b3c8c8','#90a7ac'])+'</defs>'+
 G(R(404,34,442,127,'#62727a')+cars,'transform="translate('+xx+' 122) scale(1.63 2.34)"');
}
function railwayCrossing(t){
 const drift=t*5+89*ease((t-2.65)/.45);
 let s=digitalSky()+G(mountains(318,'#93afaf',26,87)+city(-44-drift*.18,345,.88,'#a8b9bb','#d8e4df',9),'filter="url(#soft)"')+
 rep(8,j=>crossingHouse(j*183-70-drift*.6,426-j%2*9,1.13,j))+
 P('M0 448L1200 378V675H0Z','#bcc8c9')+P('M0 471L1200 399V413L0 486Z','#e2e3d4')+
 rep(24,j=>{const x=j*55-drift;return P('M'+x+' '+(462-x*.06)+'v-40l4 -1v41Z','#8e9fa1')})+
 P('M0 426L1200 354M0 442L1200 370','none',st('#a1b0ae',2.2));
 s+=rep(5,j=>G(P('M0 425L-4 101M-26 129h58M-24 114h47','none',st('#657f89',4))+
 rep(4,k=>P('M'+(-23+14*k)+' '+(121+k*2)+'q145 63 305 -14','none',st('#748a92',1.4)))+
 G(R(-10,0,18,36,'#93a5a7','rx="3"')+rep(4,k=>L(-12,5+k*7,10,5+k*7,'#738a91',2)),tr(2,145)),tr(j*305-63-drift,0)))+
 P('M-20 578L1200 464L1200 487L0 600Z','#859391')+rep(22,j=>{const x=j*60-17;return L(x,561-x*.093,x+26,605-x*.093,'#9f9e8c',9)})+
 P('M0 563L1200 451M0 593L1200 481','none',st('#7d8c8e',5))+P('M0 561L1200 449M0 591L1200 479','none',st('#e1e5d7',1.8));
 return s;
}
function crossingSignal(t){
 const postX=155,postY=179,down=ease((t-.75)/1.1)*(1-ease((t-4.25)/1.1)),blink=Math.floor(t*4)%2;
 let s=P('M-6 35h13v292H-6Z','#7d7c66')+rep(12,j=>P('M-6 0l13 -7v11l-13 7Z',j%2?'#e3bb65':'#4b5758',tr(0,46+j*21)))+
 G(R(-36,-5,72,10,'#dab45a',st('#5b6661',1))+rep(4,j=>R(-33+j*19,-5,9,10,'#5a6260')),tr(0,16,1,45))+
 G(R(-36,-5,72,10,'#dab45a',st('#5b6661',1))+rep(4,j=>R(-33+j*19,-5,9,10,'#5a6260')),tr(0,16,1,-45))+
 R(-36,51,72,27,'#47555a','rx="12"')+rep(2,j=>C(-19+j*39,64,9,Math.abs(blink-j)&&down>.02?'#ff7861':'#865b58',st('#36454a',3)))+
 R(-14,219,28,36,'#82918b','rx="3"')+
 G(R(0,-5,304,10,'#dec16c')+rep(10,j=>R(10+j*29,-5,13,10,'#56605a'))+C(0,0,10,'#7f8983',st('#52605c',3)),
 'transform="translate(0 238) rotate('+(-75*(1-down))+')"');
 return G(s,tr(postX,postY));
}
function crossingHouse(x,y,z,j){
 const wall=['#d3d5ca','#c6d0cc','#e1d6bf','#d1d2c4'][j%4],side=['#a3aeaa','#a5b3b3','#b6af9f','#aab3ab'][j%4],roof=['#61747d','#74848a','#7f8782'][j%3];
 const store=j%3===1,tall=j%2?123:148;
 let home=R(0,-tall,131,tall,wall)+P('M131 '+(-tall)+'l23 -11v'+tall+'l-23 11Z',side)+
 P('M-10 '+(-tall)+'l30 -36h100l24 35Z',roof,st('#67777b',2))+
 P('M120 '+(-tall-36)+'l21 -11l30 35l-27 11Z','#859396',st('#73858a',1.5))+
 rep(7,k=>L(6+k*17,-tall-2,25+k*13,-tall-32,'#9aa5a1',1))+R(0,-tall,131,5,'#9ca9a5')+
 rep(2,k=>G(R(0,0,43,27,'#6c8891',st('#eee9d7',3))+P('M2 2l32 1l-26 21H1Z','#a0b4b5')+L(22,0,22,27,'#d1d5c9',2),tr(13+k*62,-tall+17)))+
 R(4,-tall+52,124,6,'#b1b6ac')+L(3,-tall+32,131,-tall+32,'#91a19f',2)+
 rep(15,k=>L(6+k*8.6,-tall+32,6+k*8.6,-tall+51,'#899c9a',1.25))+
 P('M126 '+(-tall+3)+'v'+(tall-18)+'l-4 4v10','none',st('#98a7a1',2.5));
 if(store){
  home+=R(-4,-67,139,21,'#849c9f')+T(65,-51,'碧 海 写 真 館',12,'#f4eedc','text-anchor="middle"')+
   R(5,-42,76,42,'#91a8ad',st('#dfe0ce',2))+R(89,-43,32,43,'#778e96',st('#e7e2d2',2))+L(44,-42,44,0,'#d4d7ca',2.4);
 }else{
  home+=R(12,-49,30,50,'#798f91')+R(16,-45,22,29,'#a0b1b1')+R(55,-55,53,28,'#b4c4c2',st('#e6e4d4',2))+
  R(76,-21,34,19,'#c7cfbf',st('#a0ada7',1.3))+C(85,-11,6,'none',st('#a5b1aa',1.5))+rep(4,k=>L(94,-16+k*3,106,-16+k*3,'#a3b0a9',1));
 }
 return G(home,tr(x,y,z));
}
function floweringTree(x,y,z,seed){
 const tree=fixedDrawing('flowering-tree-'+seed,()=>{
 const shades=['#cf9eb4','#dfafc0','#edc1ce','#f4d2d8','#fce4e2'];
 const branches=P('M-12 0Q0 -62 -7 -119Q-15 -145 -66 -166L-84 -185Q-53 -162 -24 -157Q-17 -157 -18 -168L-31 -205Q-13 -184 -6 -153Q1 -139 12 -162L25 -199L42 -216L31 -191L24 -159Q55 -174 78 -196L94 -199Q55 -157 23 -144Q7 -114 9 -81L15 0Z','#776775')+
 P('M-7 -8Q2 -74 -3 -117Q-5 -139 -25 -150M6 -108q0 -28 15 -44','none',st('#a18a94',2.1));
 const clusters=rep(65,j=>{
  const a=rand(j+seed)*pi*2,r=Math.sqrt(rand(j+400+seed)),cx=r*118*Math.cos(a),cy=-191+r*46*Math.sin(a)-.12*cx;
  const tone=shades[Math.floor(clamp((.6-cy*.001-rand(j+134)*.8))*4)];
  return G(P('M-19 2q-6 -7 2 -13q-1 -8 9 -8q8 -9 15 -2q9 -4 13 6q12 1 8 12q4 9 -6 12q-3 8 -14 5q-11 7 -15 -3q-13 2 -12 -9Z',tone),tr(cx,cy,.51+rand(j+71)*.68,rand(j+25)*60));
 });
 const bloom=rep(115,j=>{
  const r=Math.sqrt(rand(j+seed+91)),a=rand(j+seed+24)*2*pi;
  return G(star(0,0,3.2,j%4?'#f8d5dd':'#fff0e8',5)+C(3,2,1.3,'#dfafbd'),
   tr(r*127*Math.cos(a),-196+45*r*Math.sin(a)-.13*r*117*Math.cos(a),.53+rand(j+309),j*23));
 });
 return branches+clusters+bloom;});return G(tree,tr(x,y,z));
}
function stageNineteen(t,overscan=0){
 const snap=n=>Math.round(n/4)*4,step=stageNineteenPhase(t),z=.91;
 const x=snap(406+step*22.5),circumference=2*pi*56*z;
 const scroll=(step-2)*circumference-(x-snap(451)),pit=660-scroll;
 const jump=clamp((step-1.75)/2.25),rise=4*jump*(1-jump);
 const y=504-244*z-snap(143*rise),won=t>=3;
 const world='<defs>'+pat('earthTiles',48,40,R(0,0,48,40,'#986c53')+P('M0 0h48v4H0Zm3 8h26v4H3Zm29 16h16v4H32ZM12 31h22v4H12Z','#b68a60')+P('M0 32h10v4H0Zm33 -22h11v5H33ZM16 19h8v3h-8Z','#815b50'))+'</defs>';
 let s=world+R(0,0,1200,675,'#80c4c3')+
 rep(8,j=>G(P('M0 16h12V8h16V0h28v4h12v8h16v8h12v12H0Z','#e9e9bc')+P('M4 26h88v6H4Z','#cbd8b2'),tr(j*196-75-snap(step*8),108+(j%3)*30,1.15)))+
 rep(12,j=>G(P('M0 192v-40h20v-32h24V76h20V48h20V20h16V0h24v20h20v24h16v32h20v40h28v32h24v44Z','#76a8a0')+P('M80 48h4V20h16V0h24v16h-16v20h-8v16H80Z','#a5cbb0'),tr(j*142-105-snap(step*17),196+rand(j)*32)))+
 rep(21,j=>G(P('M0 102V67h8V43h12V28h12V8h20V0h12v16h12v20h12v20h12v46Z',j%3?'#5b9584':'#548c82')+P('M20 50h12V29h12v-8h9v9H43v12H32v8Z','#79a589'),tr(j*82-101-snap(step*27),328+j%3*8)))+
 pixelMill(298-snap(step*11),349,step)+R(0,429,1200,246,'#5e918c')+R(0,526,1200,149,'#476977')+
 rep(24,j=>R(j*60-snap(step*30)%60,550+Math.floor(rand(j)*22)*4,20+(j%3)*8,4,'#76a398'));
 let groundTiles='';
 for(let k=Math.floor((-pit-overscan)/48);k<=Math.ceil((1200+overscan-pit)/48);k++){
  if(k>=0&&k<3)continue;
  const xx=pit+k*48;if(xx< -50-overscan||xx>1200+overscan)continue;
  groundTiles+=G(R(0,0,48,172+overscan,'url(#earthTiles)'),tr(xx,504))+P('M0 0h48v13h-6v6h-8v-5h-9v7h-8v-8H4v-5H0Z','#5b8053',tr(xx,504))+
  R(xx,504,48,5,'#cbd176')+R(xx+6,509,24,4,'#a0b766');
  if((k+30)%5===1)groundTiles+=G(P('M0 0v-8h-4v-4h8v8h4v-12h4v8h4v-4h4v8H8v4Z','#719a58')+
    R(9,-21,6,5,'#f5c076'),tr(xx+12,504));
  if(k===-1||k===3)groundTiles+=rep(7,j=>R(xx+(k<0?42:0),528+j*20,6,10,j%2?'#cd9b67':'#694d48'));
 }
 const coinX=702-scroll+(circumference-(snap(473.5)-snap(451))),coinY=117;
 function coin(x,y){
  const width=[1,.7,.38,.65][Math.floor(t*8)%4];
  return G(P('M-8 -17H8v4h6v5h3V8h-3v5H8v4H-8v-4h-6V8h-3V-8h3v-5h6Z','#936447')+
   P('M-7 -13H7v4h6V8H8v4H-7V8h-5V-8h5Z','#f8c953')+R(-5,-10,4,18,'#fff1a1')+R(5,-6,3,15,'#c98c47'),
   'transform="translate('+x+' '+y+') scale('+width+' 1)"')
 }
 s+=rep(4,j=>G(R(0,0,37,27,'#a87655',st('#594752',3))+P('M3 3h31v4H3Zm0 9h13v5H3Zm18 8h13v4H21Z','#dba46c'),tr(pit+441+j*39,232)));
 if(!won)s+=coin(coinX,coinY);
 let fg=G(R(0,0,256,76,'#354750')+R(4,4,248,68,'#f0e2bd')+tileLetters(15,13,'SCORE',1.8,'#5b6957')+
  tileLetters(15,36,won?'004500':'004000',2.85,'#2f4547')+
  P('M151 34h5v-6h10v5h18v6h-10v4h-9v5h-14Z','#de9d5e',st('#465359',2))+
  mt(188,53,'× 0'+(won?'4':'3'),20,'#40565a','font-weight="bold"'),tr(908,37));
 if(won&&t<4.15){
  const age=t-3;
  fg+=tileLetters(679,75-snap(18*age),'1UP',3.7,'#446055')+tileLetters(676,72-snap(18*age),'1UP',3.7,'#fff0a0')+
  rep(8,j=>R(702+Math.cos(j*pi/4)*(15+age*55),117+Math.sin(j*pi/4)*(12+age*42),age<.65?5:0,5,'#fff3ab'));
 }
 return {sky:G(s,'shape-rendering="crispEdges"'),ground:G(groundTiles,'shape-rendering="crispEdges"'),fg,x,y,z,finish:1959-scroll,pit};
}
function rainDistrict(t){
 let skyline=R(0,0,1200,675,'url(#nightAtmosphere)')+
 C(865,108,115,'#ae73b1','opacity=".06"')+
 city(-17-t*2,266,.92,'#363a57','#64718d',91);
 const trims=['#77c1c7','#ca82b2','#898dd0'];
 for(let j=0;j<11;j++){
  const x=j*128-71-t*5,h=131+rand(j+16)*152,y=416-h,c=['#292e49','#2c354c','#35354c'][j%3];
  const face=R(0,0,113,h,c)+P('M0 0l16 -11h112L113 0Z','#505169')+
    P('M113 0l15 -11v'+h+'l-15 11Z','#202c42')+
    R(8,-12,42,12,'#3f4258')+L(19,-12,19,-41,'#667085',2)+C(19,-41,2.2,'#d79ca8')+
    rep(Math.floor(h/22)*5,k=>{const row=Math.floor(k/5),col=k%5;return R(9+col*20,16+row*22,9,6,rand(k+j*100)>.66?trims[(j+row)%3]:'#424b62')})+
    P('M6 24h8v'+(h-35)+'h14','none',st('#626177',3))+
    rep(3,k=>G(R(0,0,25,14,'#454b60',st('#697387',.8))+C(7,7,4,'none',st('#88909a',.9))+rep(3,n=>L(13,4+n*3,21,4+n*3,'#7b8391',1)),tr(75,34+k*31)));
  skyline+=G(face,tr(x,y));
 }
 skyline+=P('M-20 251L1220 195v20L-20 275Z','#202b40',st('#4c6678',2))+
 rep(27,j=>G(P('M0 0l24 14l20 -16','none',st('#556476',2)),tr(j*47,248-j*2.14)))+
 rep(4,j=>G(P('M0 0h29l-5 37v166h-15V36Z','#222c43',st('#434a61',2)),tr(82+j*330,262-j*15)));
 // A local elevated train travels behind the street-level lightboxes.
 skyline+=G(R(0,0,152,16,'#677789','rx="4"')+R(0,12,152,3,'#d595b0')+rep(12,j=>R(7+j*12,3,7,6,'#f1cda6')),tr(60+t*89,232-t*4,1,-2.6));
 let street=rep(5,j=>G(R(0,-132,230,133,'#263044',st('#1c2737',3))+
    R(8,-116,213,25,'#4b4057')+mt(18,-99,['STATION  09','NIGHT FERRY','REPAIR  •  24','HARBOR LINE','TRANSIT'][j],12,j%2?'#e0abc1':'#9cd6d3','letter-spacing="2"')+
    R(12,-82,105,77,'#354155')+rep(10,k=>L(13,-77+k*7,115,-77+k*7,'#657083',1))+
    R(129,-79,71,73,'#29394b')+R(138,-71,52,45,'#607481')+P('M142 -28l42 -40h6v10l-33 33Z','#8b889c')+
    L(10,-90,221,-90,j%2?'#da91b3':'#7abaa9',2.4),tr(j*249-27-t*6,475+j%2*5)));
 const signs=rep(5,j=>{const col=j%2?'#eba0ca':'#8ee8df';
  return G(R(3,4,45,96,'#1c243a')+R(0,0,44,95,'#30314c','rx="3" '+st(col,2))+R(5,5,34,85,'none',st(col,.7))+
  T(22,35,['深','夜','修','港','灯'][j],22,col,'text-anchor="middle"')+T(22,64,['湾','市','理','口','室'][j],22,col,'text-anchor="middle"')+
  rep(5,k=>R(8+k*6,75,4,5,col)),tr(94+j*228-t*7,211+(j%2)*34,.91))});
 return '<defs>'+grad('nightAtmosphere',['#192139','#303653','#58506b'])+grad('wetStreet',['#283044','#272b42','#191f34'])+
 '<clipPath id="streetPuddle">'+P('M156 574Q346 551 510 558T845 545Q1070 529 1210 536V622Q1019 635 793 625Q562 647 338 630Q118 619 12 627L9 603Q163 593 252 589Z','white')+'</clipPath></defs>'+
 skyline+street+G(signs,'opacity=".24" filter="url(#soft)"')+signs+P('M0 487L1200 467V675H0Z','url(#wetStreet)')+
 P('M0 501L1200 479','none',st('#75a6af',2))+P('M0 534Q516 512 1200 504','none',st('#5c7588',1))+
 G(G(signs,'transform="translate(0 773) scale(1 -.72)"'),'clip-path="url(#streetPuddle)" opacity=".27"')+
 rep(80,j=>G(P('M0 1q18 -4 44 -1l-11 2Z',j%3?'#56768b':'#a76291'),tr(rand(j+4)*1210,512+rand(j+156)*149,.4+rand(j)*1.1)),'');
}
function nightBillboard(t,riderId){
 const live=t>=2,col='#80e9df',hot='#ee9bc8';
 let screen=R(-4,-3,382,213,'none',st(hot,8)+' opacity=".11"')+R(7,9,374,206,'#151e31')+R(0,0,374,206,'#31314f','rx="4" '+st('#66536d',4))+
  R(4,4,366,198,'none',st(hot,2))+R(11,11,352,169,'#263149')+
  (live?'<svg x="11" y="11" width="352" height="169" viewBox="27 -104 308 148" overflow="hidden">'+
     R(20,-110,330,162,'#39415a')+P('M18 27l306 -111v30L27 58Z','#414d65')+
     '<use href="#'+riderId+'"/>'+R(20,-108,330,165,'url(#scan)','opacity=".23"')+'</svg>':
     G(P('M-40 18l100 -15l-16 29h-68Z',col)+P('M-20 9l13 -21h34l10 14Z','none',st(col,2))+rep(3,j=>P('M-44 35q24 -5 51 1t52 -3','none',st(j%2?hot:col,1.6)),''),tr(72,87))+
     T(231,94,'深 湾 夜 航',29,'#d4c7e0','text-anchor="middle"')+mt(229,125,'MIDNIGHT FERRY',13,col,'text-anchor="middle" letter-spacing="2"'))+
  C(20,192,3.5,live?hot:col)+mt(33,196,live?'LIVE   /   CAMERA 20':'PIER 03    /    23:50',13,live?hot:col,'letter-spacing="1.3"')+
  rep(12,j=>R(278+j*6,189,3,7,live&&j<(t*6%12)?hot:'#73627d'));
 if(live)screen+=P('M19 41V20h22m292 0h20v21m0 109v21h-20m-292 0H19v-21','none',st(col,1.7))+
  R(12,14+(t*83)%162,349,3,'#affef2','opacity=".25"');
 return screen;
}
function rainInStreet(t,x,y,scale,riderId){
 const billboard=nightBillboard(t,riderId);
 let background=rainDistrict(t)+G(billboard,'transform="translate(761 68) skewY(-3)"')+
 G(G(billboard,'transform="translate(761 699) scale(1 -.51) skewY(-3)"'),'clip-path="url(#streetPuddle)" opacity=".18"')+
 G('<use href="#'+riderId+'" transform="translate('+x+' '+(y+348)+') scale('+scale+' -.47)"/>','clip-path="url(#streetPuddle)" opacity=".34"');
 const drops=rep(112,j=>{let yy=(rand(j+64)*731+t*(181+121*rand(j)))%730-33;
  return L(rand(j+210)*1270-yy*.09,yy,rand(j+210)*1270-yy*.09-2,yy+9+rand(j+80)*12,j%3?'#bfd6dd':'#e5c5df',.85,'opacity=".41"')})+
  rep(14,j=>{let u=(t*1.12+rand(j))%1;return '<ellipse cx="'+(rand(j+44)*1190)+'" cy="'+(529+rand(j+63)*119)+'" rx="'+(2+12*u)+'" ry="'+(.5+2.3*u)+'" fill="none" stroke="#a2becb" stroke-width=".85" opacity="'+(.61*(1-u))+'"/>'});
 return [background,drops];
}
function cutTree(x,y,z,col,j){
 const variety=(j%9+9)%9;
 const tree=fixedDrawing('paper-tree-die-'+variety,()=>{
  const twigs='M-15 2l5 -85l-12 -23l-23 -17l-9 -22l28 25l17 9l1 -38l-15 -27l21 17l7 21l17 -28l8 -25l2 22l-9 27l-9 24l25 -14l18 -20l-5 19l-23 22l-16 10l3 45l7 37Z';
  const crown=Array.from({length:49},(_,k)=>{const a=k*turn/49;
   const silhouette=1+.087*Math.sin(a*7+variety*.75)+.061*Math.cos(a*11+variety*.45)+.048*rand(53*variety+k);
   return point(Math.cos(a)*silhouette*(59+variety),-161+Math.sin(a)*silhouette*48);
  });
  const cuts=' M-26 -150q0 -14 13 -20q-3 13 -13 20Z M17 -169q4 -13 17 -16q-6 12 -17 16Z';
  return P(twigs,'currentColor')+P(roundContour(crown)+cuts,'currentColor','fill-rule="evenodd"');
 });
 return G(tree,tr(x,y,z)+' color="'+col+'"');
}
// Successive translucent cuts give the shadow a soft outer edge. Paint
// opacity is inherited by the paths, so no viewport-sized blur is required.
function paperRelief(shape,depth=1){
 const die=shape.replace(/(fill|stroke|color)="(?!none")[^"]*"/g,'$1="#385647"');
 return G(die,tr(4.5*depth,8*depth)+' fill-opacity=".12" stroke-opacity=".12"')+
  G(die,tr(2.3*depth,4.3*depth)+' fill-opacity=".19" stroke-opacity=".19"')+shape;
}
function paperWood(t){
 const background=R(0,0,1200,675,'#d1d8bb');
 let s=background+paperRelief(C(839,129,79,'#fae5ad')+P('M789 156q65 17 99 -72q22 72 -37 109q-43 17 -62 -37Z','#f6dca6'),.8)+
 rep(25,j=>star(rand(j+15)*1190,40+rand(j+86)*221,2.8+rand(j)*4,'#faefcc',4))+
 paperRelief(mountains(331,'#b0c0ac',29,93)+rep(14,j=>pine(j*100-t*2,321,.46+rand(j)*.36,'#a6b9a4')),.73);
 for(let k=0;k<2;k++){
  const soil=['#92afa1','#71998b'][k],ground=360+k*55;
  s+=paperRelief(hills(ground,soil,31)+rep(12,j=>cutTree(j*131-91-t*(3+2*k),ground+rand(j+27)*17,.40+rand(j+k*71)*.47,soil,j+k*27)),.83+k*.15);
 }
 const cabin=G(P('M-52 0v-72l64 -42l47 47V0Z','#e8cfa4')+P('M-67 -66l62 -62l77 59l-11 8l-64 -42l-53 46Z','#aa7159')+
  R(-34,-60,23,30,'#fbe9b8')+P('M-23 -59v28m-11 -13h23','none',st('#967c60',2))+P('M19 0v-44q13 -16 24 0V0Z','#967c62')+
  P('M39 -93v-22h13v32Z','#947767'),tr(925,428,.91));
 s+=paperRelief(hills(476,'#678f7f',36)+cabin,1.05)+paperRelief(P('M-10 531Q421 473 701 491Q960 506 1220 461V678H-10Z','#cfbf98')+
  P('M-10 537Q440 482 702 498Q994 509 1210 469','none',st('#e7d8b1',4)),.83);
 const frame=P('M0 0H1200V675H0Z M29 589Q69 489 49 342Q38 250 88 140Q121 79 215 58Q262 49 352 54Q479 58 536 37Q673 10 787 41Q847 64 944 56Q1059 48 1117 145Q1161 233 1125 350Q1109 421 1141 512Q1162 568 1116 612Q1028 646 916 622Q784 602 680 624Q547 654 424 628Q320 608 219 623Q116 641 29 607Z','#385f56','fill-rule="evenodd"');
 const fern=(x,y,z,r)=>G(P('M0 0q8 -52 39 -92M7 -34q-28 -2 -39 -27q27 4 39 27Zm6 -16q-21 -12 -24 -34q23 10 24 34Zm10 -18q-12 -19 -8 -36q17 14 8 36Zm-13 25q25 -22 44 -17q-13 18 -44 17Zm15 -27q16 -22 31 -20q-5 14 -31 20Z','#496f61',st('#496f61',1.7)),tr(x,y,z,r));
 const mush=(x,y,z)=>G(P('M-4 0l2 -29h8L9 0Z','#eed2aa')+P('M-20 -24q0 -24 20 -36q17 6 26 33l-15 5Z','#ad715c')+P('M-16 -24l20 -5l15 3l-10 4Z','#db9b79')+C(-4,-43,3,'#f1dbaf'),tr(x,y,z));
 const foreground=paperRelief(frame+fern(22,613,1.1,-14)+fern(1128,596,1.2,12)+fern(1177,445,.9,-45)+
  rep(8,j=>mush(j<4?43+j*37:1007+j%4*35,615+(j%2)*7,.47+rand(j)*.52)),1.15);
 let wind='';
 if(t>1.5&&t<4.55){
  const gust=ease((t-1.5)/.42)*(1-ease((t-3.85)/.7));
  wind=G(rep(13,j=>{const xx=((t-1.5)*(180+j*7)+rand(j)*1130)%1290-45,yy=190+rand(j+28)*233+Math.sin(t*4+j)*17;
    return G(P('M-15 0q9 -11 22 -7l11 4q-12 9 -33 3Z','#d7be8f')+P('M-12 -1l22 -3l-4 4Z','#aa977a'),tr(xx,yy,.53+rand(j)*.51,j*31+t*102))})+
    rep(3,j=>P('M'+(295+j*42)+' '+(253+j*27)+'q54 -20 110 -5t120 -1','none',st('#eee5c7',1.4))), 'opacity="'+gust+'"');
 }
 return [s,wind+foreground];
}
function cityPedalTime(t){return t-clamp(t-2.48,0,.48)+.48*ease((t-2.96)/1.52)}
const tileFont={
 '0':['01110','10011','10101','10101','11001','10001','01110'],'1':['00100','01100','00100','00100','00100','00100','01110'],
 '3':['11110','00001','00001','01110','00001','00001','11110'],'4':['00010','00110','01010','10010','11111','00010','00010'],
 '5':['11111','10000','10000','11110','00001','00001','11110'],'U':['10001','10001','10001','10001','10001','10001','01110'],
 'P':['11110','10001','10001','11110','10000','10000','10000'],'S':['01111','10000','10000','01110','00001','00001','11110'],
 'C':['01111','10000','10000','10000','10000','10000','01111'],'O':['01110','10001','10001','10001','10001','10001','01110'],
 'R':['11110','10001','10001','11110','10100','10010','10001'],'E':['11111','10000','10000','11110','10000','10000','11111']
};
function tileLetters(x,y,label,size,col){
 let d='';
 [...label].forEach((letter,index)=>tileFont[letter].forEach((row,k)=>{
  for(let j=0;j<row.length;j++)if(row[j]==='1')d+='M'+(index*6+j)+' '+k+'h1v1h-1Z';
 }));
 return G(P(d,col),tr(x,y,size)+' aria-label="'+label+'"');
}
function pixelMill(x,y,t){
 const sails=rep(4,j=>G(P('M-2 -3h4v-12h7v-8h5v-8h6v-8H5v6H1v8h-3Z','#d5d4a9',st('#6e9790',1.3)),tr(0,0,1,Math.floor(t*8)*5+j*90)));
 return G(P('M-23 57v-9h4v-32h4v-24h6v-9h21v9h5v24h4v32h5v9Z','#a0b4a0')+
 P('M-24 -7v-6h8v-7h6v-6h19v5h7v7h7v7Z','#748f88')+R(-4,25,8,11,'#75948b')+R(4,45,11,13,'#76958a')+
 G(sails+C(0,0,4,'#708b81'),tr(0,2)),tr(x,y,1.15));
}
function voyagerWindow(x,y,j,t){
 const peer=ease((t-1.05-(j%7)*.19)/.5),lamp=['#efd49a','#f8daa1','#eace93'][j%3];
 return G(R(0,0,34,44,lamp,'rx="7" '+st('#bc985f',2))+
 '<svg width="34" height="44" viewBox="0 0 34 44" overflow="hidden">'+
 P('M1 0h10Q13 17 3 30L1 35ZM33 0h-8q-2 16 7 25Z','#a17355')+
 G(P('M-13 29q0 -21 13 -23q15 4 15 22Z',['#566569','#825d50','#696579'][j%3])+C(0,0,6.5,'#d7ae82')+
 P('M-7 1q-3 -11 5 -12q11 -1 10 9l-5 -4l-6 5Z','#554849')+C(3.4,-1,1,'#423c38')+
 (j%3===0?G(P('M5 17q8 -1 9 -15','none',st('#c19775',3)),tr(0,peer*-2)):''),
 tr(12+6*peer,39-15*peer,.72+.28*peer))+
 P('M6 0h5L0 20v-7ZM25 3h3l-12 25h-2Z','#fff1c6','opacity=".38"')+'</svg>',tr(x,y));
}
function voyagerTrain(t){
 const gold='#c5a36c',shell='#223749',shadow='#112638';let cars='';
 for(let k=0;k<3;k++){
  const end=k===2;
  let car=P(end?'M8 14Q10 4 31 4h246q57 3 94 40l32 28q10 11 -4 17l-61 13H10Q2 102 2 87V24Z':'M4 22Q4 6 27 5h286q28 0 31 16v73l-12 9H14L4 95Z',shell,st(gold,2))+
   P('M14 17q4 -8 22 -8h241q18 0 35 7Z','#42606c')+
   rep(3,j=>P('M14 '+(76+j*5)+'H'+(end?365-j*9:331),'none',st(j===0?'#dfbf7b':'#877753',j===0?2.1:1)))+
   R(13,94,end?325:316,8,shadow)+
   rep(2,j=>G(R(-22,-6,47,11,shadow,'rx="3"')+C(-12,5,10,shadow,st('#99845d',1.5))+C(12,5,10,shadow,st('#99845d',1.5)),tr(46+j*230,102)))+
   rep(end?6:7,j=>voyagerWindow(19+j*42,22,j+k*7,t));
  if(end){
   car+=P('M279 22q32 2 60 27l24 18l-67 -3Z','#e6c28b',st(gold,1.7))+
    P('M302 26l12 39m10 -28l14 28','none',st('#51616b',3))+
    P('M328 76q39 -3 63 -1q-11 9 -53 11Z','#6d766f')+C(386,77,3.9,'#ffecb5')+
    star(316,49,8,'#f9e1a0');
  }else{
   car+=R(315,23,17,67,shadow,'rx="5" '+st(gold,1))+R(319,29,9,22,'#edce94','rx="3"')+
   P('M344 42h14v37h-14Z',shadow)+rep(3,j=>L(347+j*4,43,347+j*4,77,'#647276',1));
  }
  car+=G(R(0,0,115,14,shadow,'rx="7" '+st('#a68b60',.8))+mt(57,10,end?'LYRA  •  02':'ORBIT EXPRESS',8,gold,'text-anchor="middle" letter-spacing="1.3"'),tr(103,73));
  cars+=G(car,tr(k*356,0));
 }
 return G(cars,tr(24-t*24,281,1.04));
}
function orbitTicket(t,trainX=0,trainY=0,trainScale=1){
 if(t<2)return '';
 const u=clamp((t-2)/1.3),open=ease(u),source=trainX+trainScale*(24-48+1.04*(712+19+4*42+18));
 const x=source+(847-source)*open+Math.sin(pi*u)*22,y=(trainY+324*trainScale)*(1-open)+185*open-46*Math.sin(u*pi);
 const ticket=P('M0 0h265v16q-11 4 0 11v33q-11 4 0 11v16H0V71q11 -6 0 -11V27q11 -7 0 -11Z','#eed49f',st('#786544',1.4))+
 R(6,6,253,74,'none',st('#ab8756',1))+P('M208 7v72','none','stroke="#98774b" stroke-dasharray="3 3"')+
 mt(14,25,'ONE WAY   /   LYRA LINE',12,'#745232','letter-spacing="1.2"')+
 T(14,54,'终点站：下一种画法',20,'#443a30','font-weight="bold"')+L(14,63,191,63,'#b39364')+
 mt(14,76,'O R B I T   E X P R E S S',8,'#7e6545')+
 rep(16,j=>R(217+j*2.1,20,1+j%2,29,'#806341'))+mt(233,67,'002',14,'#715535','text-anchor="middle"');
 return G(ticket,tr(x,y,.045+.955*open,12-20*open-17*Math.sin(pi*u*2)));
}
function starlightRoute(t,x,y){
 let s='<defs>'+grad('routeSky',['#131d34','#213248','#405165'])+'</defs>'+R(0,0,1200,675,'url(#routeSky)')+
 rep(162,j=>C(rand(j+1)*1233-t*(j%3)*.6,rand(j+207)*486,.5+rand(j+513)*1.5,j%4?'#cbd5d5':'#e7c995'))+
 rep(9,j=>{const xx=j*155-66-t*.8,yy=112+rand(j+410)*134;
  return G(P('M0 0l37 -19l51 8l17 -38','none',st('#80939e',.8))+C(0,0,2,'#d9d8c2')+C(37,-19,2.4,'#e8cea0')+C(88,-11,1.7,'#d4d5bf'),tr(xx,yy))})+
 P('M-110 252Q502 -37 1290 113','none','stroke="#c8ae76" stroke-width="1" stroke-dasharray="2 8" opacity=".52"')+
 G(C(0,0,67,'#b6937a')+P('M-65 -11q72 19 125 -21l4 11Q12 17 -66 2Z','#cfb495')+
 P('M-63 15Q8 34 67 -9q-8 30 -32 51Q-9 59 -58 31Z','#988684')+
 P('M-111 12Q-130 -1 -56 -19M64 -18Q122 -13 117 -3Q84 23 -43 25Q-101 25 -111 12Z','none',st('#dbc6a1',3)),tr(934,116,1,-14))+
 mountains(423,'#29394a',12,67)+G(P('M-8 17Q590 -11 1216 1v22Q607 11 -8 44Z','#263643')+
 rep(20,j=>G(P('M0 17l44 53l23 -52Z','none',st('#5b625c',3.1)),tr(j*66-43,0)))+
 P('M0 15Q567 -10 1200 -2','none',st('#d0b17a',2.6)),tr(0,395))+
 voyagerTrain(t)+road(525,'#1d2b3a','#bd9d69')+rep(31,j=>L(j*46-(t*38)%46,555,j*46-64-(t*38)%46,631,'#79745e',4))+
 P('M0 628Q724 595 1212 604','none',st('#dabb80',3));
 const trail=rep(16,j=>{let u=(t*.95+j/16)%1;return star(x-93*u,y+223-16*Math.sin(u*pi)-23*u,1+(1-u)*4,'#f3d394')});
 return [s,orbitTicket(t),trail];
}
function citadel(t,school=0){
 const stone=colour('#ecd4a8','#f1f3e9',school),shadow=colour('#baa789','#b4cbcc',school),roof=colour('#706887','#91afba',school);
 function turret(x,y,scale,n){
  const peak=mixN(48,4,school);
  let f=P('M-19 3v-76h38V3Z',stone,st('#a69b84',1.3))+P('M6 -72h13V3H6Z',shadow)+
    P('M-25 -72l24 -'+peak+'l26 '+peak+'Z',roof,st('#676780',1.2))+opacity(P('M-2 -117l8 44h13Z','#918394'),1-school)+
    R(-22,-73,44,5,'#d7bd97')+P('M-13 -42v-11q3 -8 7 0v11Zm17 0v-11q4 -8 7 0v11Z','#697b7c')+
    rep(3,j=>L(-14+j*8,-10-j*9,-7+j*8,-10-j*9,'#d4bc98',1.5))+
    opacity(L(0,-117,0,-140,'#947a51',1.6)+P('M1 -139q8 -3 14 0l'+(9+Math.sin(t*3+n)*3)+' -1l-8 6q-9 -5 -15 -1Z','#bd7057'),1-school);
  return G(f,tr(x,mixN(y,-8,school),mixN(scale,.89,school)));
 }
 let walls=P('M0 -6v-42h10v-9h9v9h12v-9h9v9h11v-9h10v9h11v-9h10v9h16v-9h10v9h12v-9h10v9h13v-9h10v9h18v-9h9v9h11v-9h10v9h12v42Z',stone,st('#ac9b80',1.4))+
 P('M65 -6v-15q15 -27 30 0v15Z','#768484')+P('M61 -6v-17q18 -32 38 0v17','none',st('#c2a985',4));
 const campusWing=R(-4,-64,222,65,stone)+R(-6,-68,226,6,roof)+rep(24,j=>R(3+j%12*18,-55+Math.floor(j/12)*25,12,15,'#97b8c2'))+R(70,-16,79,16,'#6c939f');
 return G(opacity(P('M-57 4Q3 -11 28 -5L200 -16L255 -3L234 23L203 31L170 73L118 94L41 69L-10 44Z','#929b8a')+
  P('M-57 4L41 -7L127 -1L216 -18L252 -2L204 13L131 9L56 20Z','#acbd8c')+
  P('M167 12l34 2l-15 47l-13 -9l-16 25l10 -33l-7 -5Z','#c1e0d3'),1-school)+
  turret(141,-46,.9,2)+turret(73,-18,1.04,3)+turret(18,-13,.64,0)+walls+turret(194,-9,.75,1)+
  opacity(P('M-95 38q54 -29 121 -34v9Q-51 18 -95 45Z','#c4bd9f')+rep(4,j=>L(-80+j*25,32-j*5,-80+j*25,54-j*8,'#afa88f',3)),1-school)+opacity(campusWing,school),tr(824,288,.91));
}
function unfoldedWing(t,x,y,z,angle){
 const deploy=ease((t-1.73)/.54)*(1-ease((t-3.92)/.62));
 const hinge=[85,29],mix=(start,target)=>start+(target-start)*deploy;
 const tipL=[mix(10,-104),mix(42,-57)],tipR=[mix(175,278),mix(9,-134)],top=[mix(72,70),mix(15,-113)];
 const hem=[tipL,[mix(39,-31),mix(41,-35)],[mix(74,47),mix(34,-57)],[mix(124,120),mix(28,-45)],[mix(150,197),mix(20,-86)],tipR];
 let cloth='';
 for(let j=0;j<hem.length-1;j++)cloth+=P('M'+top.join(' ')+'L'+hem[j].join(' ')+'L'+hem[j+1].join(' ')+'Z',
 ['#d8af73','#f7dfa6','#83b2a8','#f3d69c','#b5c8a2'][j],st('#907958',1.55));
 cloth+=P('M'+tipL.join(' ')+'L'+top.join(' ')+'L'+tipR.join(' '),'none',st('#775e48',3))+
 P('M'+tipL.join(' ')+'L48 86M'+tipR.join(' ')+'L166 73M'+top.join(' ')+'L'+hinge.join(' '),'none',st('#937e58',1.65))+
 C(hinge[0],hinge[1],3,'#d6b36f',st('#806950',1));
 if(deploy>.5)cloth+=G(star(0,0,12,'#fff0ba')+C(0,0,4,'#759f93'),tr(79,mix(23,-70),deploy));
 return G(cloth,ridingPose(t,x,y,z,angle));
}
function valleyPass(t){
 const far=R(0,0,1200,675,'url(#blueSky)')+cloud(420-t*2,84,1.39,'#fbf2d9')+cloud(94-t*3,174,.96,'#fff9e6')+
 mountains(314,'#8faeac',66,121)+mountains(358,'#82a494',21,96)+citadel(t)+
 hills(377,'#a0bb81',47)+P('M-10 447Q159 394 306 412Q523 450 707 390Q887 351 1220 372V588H-10Z','#88bcb1')+
 rep(40,j=>{const x=165+rand(j)*1034,y=407+rand(j+76)*108;return P('M'+x+' '+y+'q15 -3 40 -1l-10 2Z',j%4?'#b4d3bc':'#ebdfb4')})+
 P('M-20 494Q147 459 270 473Q489 492 675 475L703 495L673 513L657 552L629 565L600 622L568 675H-20Z','#8a8b76')+
 P('M672 507l-35 47l-5 39l-19 23l7 -43l-16 15l9 -38Z','#afab85')+
 P('M531 501l-35 33l-15 48l-25 20l14 -49l-14 8l13 -31Z','#aaa885')+
 P('M-20 481Q159 454 277 468Q466 489 658 471L703 487L678 506L583 510Q435 509 257 494L-20 518Z','#95b673')+
 P('M-12 498Q247 461 415 491Q534 503 676 488','none',st('#cfc998',5))+
 P('M-15 672Q376 576 596 587Q828 598 961 535Q1071 495 1220 511V683H-15Z','#8daa6f')+
 P('M668 631Q883 580 972 548Q1082 506 1210 530','none',st('#d0ca93',16));
 return far+rep(12,j=>G(P('M0 0l3 -14l1 12l8 -6l-4 8Z','#77955f')+C(4,-11,2.3,j%2?'#f8e0a9':'#dbb1a0'),tr(45+j*52,483+rand(j+21)*8)));
}
function valleyRibbon(t){
 const open=ease((t-1.9)/.46)*(1-ease((t-4.9)/.45));if(open<=0)return '';
 const w=367*open,y=601;
 return G(P('M'+(-w)+' -21H'+w+'l13 21l-13 21H'+(-w)+'l-13 -21Z','#385b52',st('#e1c583',2))+
 L(-w+14,-15,w-14,-15,'#9aab84',1)+L(-w+14,15,w-14,15,'#9aab84',1)+
 G(T(0,8,'越过晴风原野',23,'#f6dfa6','text-anchor="middle" letter-spacing="6"')+
 star(-156,0,8,'#ebd292')+star(156,0,8,'#ebd292'),'opacity="'+ease((open-.58)/.42)+'"'),tr(600,y));
}
