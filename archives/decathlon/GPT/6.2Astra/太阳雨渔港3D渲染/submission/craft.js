'use strict';
// Small printed objects share artwork, just as a harbour shares its crate stamps and notices.
const harborPrints = new Map();
function reusablePrint(key,w,h,draw) {
  if (!harborPrints.has(key)) harborPrints.set(key,tex(w,h,draw));
  return harborPrints.get(key);
}
function printed(p,x,y,z,w,h,key,draw,angle=0) {
  const texture=reusablePrint(key,512,Math.max(90,Math.round(512*h/w)),draw);
  const artwork=plane(p,x,y,z,w,h,texture);
  artwork.rotation.y=angle;
  return artwork;
}
function stampCanvas(c,w,h) {
  c.fillStyle='#e5dfc6';c.fillRect(0,0,w,h);
  c.fillStyle='#4c7170';c.beginPath();c.arc(h*.52,h*.5,h*.35,0,Math.PI*2);c.fill();
  fishIcon(c,h*.54,h*.50,h*.21,'#eee6c8');
  c.font='bold '+Math.round(h*.46)+'px serif';c.fillText('汐見漁協',h,h*.59,w-h-20);
  c.fillRect(h,h*.71,w-h-20,2);
  c.font='600 '+Math.round(h*.16)+'px sans-serif';c.fillText('SHIOMI  FISHERIES',h,h*.92,w-h-20);
}
function detailedCrate(p,x,y,z,w=.55,color='#d5d8c8',filled=false) {
  const g=group(p,x,y,z),d=w*.69,h=w*.48;
  const blue=['#568fa0','#82a9ab','#549399','#729da0'].includes(color);
  box(g,0,.023,0,w,.046,d,color);
  for(const side of [-1,1]){
    for(const alongX of [true,false]){
      const width=alongX?w:d, edge=alongX?d:w;
      const wall=group(g,alongX?0:side*edge*.478,0,alongX?side*edge*.478:0);
      if(!alongX)wall.rotation.y=PI/2;
      if(blue){
        for(const yy of [.20,.48,.77,1])box(wall,0,h*yy,0,width,yy===1?.029:.018,.025,color);
        for(let j=0;j<8;j++)box(wall,(j/7-.5)*(width-.018),h*.49,0,.020,h,.027,color);
        box(wall,0,h*.91,0,width*.44,.035,.031,color);
      }else{
        box(wall,0,h*.47,0,width,h*.88,.037,color,true);
        box(wall,0,h*.96,0,width+.013,.033,.056,'#dee1d4',true);
        for(let j of [-1,1])box(wall,j*width*.38,h*.47,0,.023,h*.76,.049,color);
      }
    }
  }
  if(!blue)printed(g,0,h*.55,d*.5+.029,w*.47,h*.47,'crate',stampCanvas);
  else box(g,0,h*.56,d*.5+.005,w*.27,h*.22,.015,'#d7cbaa');
  if(filled){
    for(let j=0;j<8;j++)oval(g,rnd(-w*.38,w*.38),h*.80,rnd(-d*.33,d*.33),.044,.029,.036,'#c5ddd7',icoG);
    for(let j=0;j<4;j++){
      const f=group(g,(j%2-.5)*w*.38,h*.86,((j>>1)-.5)*d*.43);f.rotation.y=rnd(-.38,.38);
      const len=w*.16;oval(f,0,0,0,len,.029,.038,'#a3bcb6');oval(f,0,.014,0,len*.89,.019,.031,'#7c9b9d');
      face(f,[[-len*.8,0,0],[-len*1.4,.008,-.029],[-len*1.3,.008,.03]],'#8eabaa');
      oval(f,len*.66,.017,.024,.009,.009,.007,'#344f50');
    }
  }
  return g;
}
function paperChart(p,x,y,z,w,h,title) {
  const isRoute=title.includes('航 路')&&!title.includes('時'), isTide=title.includes('潮');
  return printed(p,x,y,z,w,h,title,(c,W,H)=>{
    c.fillStyle='#e9e4cd';c.fillRect(0,0,W,H);c.fillStyle='#557a77';c.fillRect(0,0,W,H*.205);
    c.fillStyle='#faf1d6';c.textAlign='center';c.font='bold '+Math.round(H*.098)+'px serif';c.fillText(title,W*.5,H*.142,W*.91);
    if(isRoute){
      c.fillStyle='#b9d5c9';c.fillRect(W*.07,H*.27,W*.86,H*.57);
      for(let j=0;j<4;j++){let px=W*(.13+j*.23),py=H*(.70-.09*j);c.fillStyle='#d8d5ac';c.beginPath();for(let k=0;k<13;k++){let a=k*TAU/12,r=.059+.018*Math.sin(3*a+j);c.lineTo(px+Math.cos(a)*r*W,py+Math.sin(a)*r*H)}c.fill();c.fillStyle='#566f66';c.beginPath();c.arc(px,py,4,0,TAU);c.fill()}
      c.strokeStyle='#a96c51';c.lineWidth=3;c.setLineDash([8,5]);c.beginPath();c.moveTo(W*.13,H*.7);c.lineTo(W*.82,H*.43);c.stroke();c.setLineDash([]);
    }else{
      let rows=isTide?['満 潮','干 潮','満 潮','干 潮']:['汐見発','凪島着','凪島発','汐見着','最終便'];
      let times=isTide?['05:48','11:31','17:56','23:47']:['07:10','08:25','12:40','15:15','17:30'];
      for(let j=0;j<rows.length;j++){
        let py=H*(.305+j*.115);if(j%2===0){c.fillStyle='#c7d1bf';c.fillRect(W*.06,py-H*.059,W*.88,H*.093)}
        c.textAlign='left';c.fillStyle='#486665';c.font='600 '+Math.round(H*.047)+'px sans-serif';c.fillText(rows[j],W*.09,py);
        c.font=Math.round(H*.054)+'px monospace';c.fillText(times[j],W*.43,py);c.fillText(isTide?['2.1 m','0.4 m','1.9 m','0.6 m'][j]:['07:45','09:00','13:15','15:50','18:05'][j],W*.69,py);
      }
    }
    c.fillStyle='#8c6955';c.font='600 '+Math.round(H*.034)+'px sans-serif';c.textAlign='center';c.fillText(isTide?'汐 見 港  •  潮 位 観 測':'汐見・凪島線   /   SHIOMI FERRY',W/2,H*.95);
  });
}
function instrumentDisplay(p,x,y,z,isRadar){
  const key=isRadar?'radar':'sounder';
  const screen=reusablePrint(key,384,244,(c,w,h)=>{
    c.fillStyle='#173b42';c.fillRect(0,0,w,h);c.fillStyle='#95d3b2';c.font='600 16px monospace';c.fillText(isRadar?'MARINE RADAR':'ECHO SOUNDER',12,22);c.font='12px monospace';
    if(isRadar){
      const cx=147,cy=134;c.strokeStyle='#4b8377';c.lineWidth=1.8;
      for(let k=1;k<=4;k++){c.beginPath();c.arc(cx,cy,k*23,0,TAU);c.stroke()}
      for(let i=0;i<12;i++){let a=i*PI/6;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+92*Math.cos(a),cy+92*Math.sin(a));c.stroke()}
      c.fillStyle='#93bb8980';c.beginPath();c.moveTo(cx,cy);c.arc(cx,cy,92,-1.09,-.82);c.closePath();c.fill();
      c.fillStyle='#b6d6a4';for(let i=0;i<24;i++)c.fillRect(84+i*3+Math.sin(i)*6,123+Math.cos(i*.12)*31+i*.94,4,3);
      c.fillText('N UP',278,78);c.fillText('0.75 NM',278,107);c.fillText('GAIN  62',278,136);
    }else{
      for(let j=0;j<5;j++){let py=52+j*38;c.fillStyle='#78968b';c.fillRect(10,py,328,1);c.fillText(''+j*5,344,py+3)}
      for(let i=0;i<320;i+=2){let top=147+17*Math.sin(i*.018)+5*Math.cos(i*.077);for(let j=0;j<4;j++){c.fillStyle=['#70b1a5','#b3c27a','#d1af62','#bd8056'][j];c.fillRect(i+10,top+j*8,2.2,8+rnd(0,4))}}
      c.fillStyle='#b4d9bb';c.font='bold 23px monospace';c.fillText('12.8 m',14,53);
    }
  });
  box(p,x,y,z,.238,.19,.049,'#445455',true);
  const display=plane(p,x,y,z-.028,.203,.141,screen);display.rotation.y=PI;display.material.emissiveMap=screen;display.material.emissive.setHex(0x9bc59a);display.material.emissiveIntensity=.48;
  for(let i=0;i<4;i++)box(p,x-.068+i*.042,y-.081,z-.028,.022,.011,.008,i===3?'#bb9a60':'#71857e');
}

