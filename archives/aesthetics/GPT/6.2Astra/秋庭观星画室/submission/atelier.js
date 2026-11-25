world=sites.studio;
// Raised atelier, open to the garden on the south and cut through on the west.
const floorY=1.055,left=-6.51,right=-.46,mid=-3.48,back=-4.58,front=.05;
for(let x of [-6.39,-4.51,-2.51,-.39])for(let z of [-4.66,-2.37,.62]){rock(x,.23,z,.25,.17,.22,'#99988a');box(x,.64,z,.21,.72,.21,wood)}
box(mid,.91,-2.01,6.61,.19,5.64,'#674630');for(let j=0;j<31;j++)plank(mid,1.025,-4.75+j*.18,6.59,.072,.176,pick(['#b18760','#a77c55','#b88e62','#ab8259']));
for(let i=0;i<3;i++)for(let j=0;j<3;j++){let x=-5.45+i*1.81,z=-3.73+j*1.34;box(x,1.072,z,1.8,.042,1.323,'#6c765c');box(x,1.099,z,1.73,.022,1.3,pick(['#c7c396','#cfc79d','#c4bd8e']));for(let k=0;k<30;k++)box(x,1.112,z-.63+k*.043,1.7,.001,.006,'#b3af89')}
for(let j=0;j<3;j++){let y=.22+j*.275,z=1.63-j*.3;plank(-2.6,y,z,1.63,.17,.37,lightwood);box(-2.6,y-.087,z,1.46,.14,.3,wood)}stone(-2.61,.12,2.02,.66);for(let x of [-2.77,-2.5]){ball(x,.245,2.02,.095,.033,.155,'#ba9778');ball(x,.276,1.98,.086,.043,.084,'#957554')}
for(let x of [-5.9,-.65]){pot(x,.1,.57,.24,'#98765a');box(x+.52,.29,.5,.57,.37,.41,lightwood);box(x+.52,.31,.71,.5,.045,.02,wood)}
box(mid,2.49,back,6.12,2.83,.15,'#d3c4a0');for(let x of [left,-4.77,-2.65,right]){box(x,2.5,back+.025,.14,2.99,.22,wood);for(let z of [back,.085])if(z===back||x===left||x===right)box(x,2.51,z,.139,3.03,.16,wood)}for(let y of [1.26,3.66,4.0])box(mid,y,back+.032,6.21,.15,.22,wood);
box(right,1.42,-2.29,.135,.68,4.48,wood);
let wallShape=new T.Shape();wallShape.moveTo(0,0);wallShape.lineTo(2.14,0);wallShape.lineTo(2.14,2.14);wallShape.lineTo(0,2.14);wallShape.closePath();let hole=new T.Path();hole.absarc(1.09,1.12,.71,0,TAU,true);wallShape.holes.push(hole);let wall=mesh(new T.ShapeGeometry(wallShape),'#d6bb90',right,1.77,-2.27);wall.rotation.y=Math.PI/2;ring(right,2.89,-3.36,.715,.075,wood,0,Math.PI/2);for(let i=-2;i<=2;i++)box(right,2.89,-3.36+i*.22,.05,1.36*Math.sqrt(1-(i*.31)**2),.03,wood);for(let y of [2.63,3.16])box(right,y,-3.36,.05,.035,1.27,wood);
for(let z of [-4.55,-2.75,-1,.085])box(mid,4.04,z,6.36,.18,.15,wood);for(let x of [left,right])box(x,4.06,-2.21,.17,.19,4.75,wood);for(let x of [left,-4.97,-3.44,-1.88,right]){rod(x,4.08,.12,x,4.92,-2.7,.051,wood,1,4);roofMember([x,4.92,-2.7],[x,4.08,-4.85],.065,wood,4)}
roof(mid,4.14,-2.65,6.55,4.6,.81,'#546169',true);
ring(-3.6,4.62,-3.44,.54,.057,gold,-1.96);ring(-3.6,4.609,-3.44,.501,.019,wood,-1.96);
for(let j=0;j<74;j++){let x=R(-6.49,-.48),u=rand(),z=-2.65-2.3*u;if(Math.hypot(x+3.6,(z+3.44)/.925)<.53)continue;leaf(x,4.23+.81*(1-u)**1.5,z,R(.05,.13),j%3===0,null,true)}
for(let x of [-5.91,-.97]){let w=x<-3?1.09:.81;let glazing=mesh(new T.PlaneGeometry(w,2.49),0,x,2.35,front,new T.MeshBasicMaterial({color:'#c2dbd1',transparent:true,opacity:.29,depthWrite:false,side:T.DoubleSide}));glazing.castShadow=false;for(let i=0;i<=5;i++)box(x-w/2+i*w/5,2.35,front+.06,.031,2.55,.053,wood);for(let j=0;j<8;j++)box(x,1.15+j*.337,front+.064,w,.034,.054,wood);box(x,1.32,front+.057,w,.44,.08,'#916b4c')}
box(mid,3.65,front,6.16,.103,.127,wood);for(let j=0;j<46;j++)box(left+j*.134,3.837,front,.029,.34,.065,wood);for(let x of [-5.33,-1.49]){rod(x,4,front,x,3.75,front,.014,ink);paperlamp(x,3.45,front,1.08)}
sign(-3.6,3.87,.145,1.46,.314,'星 読 画 房','#504538','#e6cf9e');
for(let j=0;j<6;j++){let x=-6.25+j*.167,l=R(.37,.76);suspended(x,3.62,.204,.17,()=>{rod(x,3.62,.204,x,3.62-l,.204,.009,wood);for(let k=0;k<3;k++){ball(x,3.55-l*k/3,.204,.063,.081,.06,pick(['#d28b42','#c87b36','#d1994c']));cyl(x,3.626-l*k/3,.204,.029,.016,sage)}})}
for(let j=0;j<15;j++)ring(-.27,3.89-j*.208,.32,.083,.015,'#8b795a',0,j%2*1.57);basin(-.25,.11,.46,.77);
function table(x,y,z,w,d,h,c=wood){plank(x,y+h,z,w,.086,d,c);for(let a of [-1,1])for(let b of [-1,1])box(x+a*(w/2-.084),y+h*.5,z+b*(d/2-.062),.084,h,.082,wood)}
// Paintings, pencil studies and celestial charts use their own ink-on-paper drawings.
function artwork(mode){return (p,w,h)=>{let dark=mode==='stars';p.fillStyle=dark?'#293f50':'#e8dbb8';p.fillRect(0,0,w,h);for(let j=0;j<3000;j++){p.fillStyle=dark?'#e9ddb31b':'#77684e14';p.fillRect(R(0,w),R(0,h),R(1,4),1)}p.strokeStyle=dark?'#c3aa72':'#90775b';p.lineWidth=2;p.strokeRect(w*.046,h*.044,w*.908,h*.912);if(dark){let cx=w*.5,cy=h*.48,r=Math.min(w,h)*.37;for(let i=1;i<=4;i++){p.beginPath();p.arc(cx,cy,r*i/4,0,TAU);p.stroke()}for(let j=0;j<24;j++){let a=j*TAU/24;p.beginPath();p.moveTo(cx+Math.cos(a)*r*.91,cy+Math.sin(a)*r*.91);p.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);p.stroke()}for(let j=0;j<14;j++){let x=R(w*.18,w*.8),y=R(h*.18,h*.76);p.beginPath();p.moveTo(x,y);for(let i=0;i<4;i++){x+=R(-w*.1,w*.1);y+=R(-h*.08,h*.08);p.lineTo(x,y);p.fillStyle='#eee2ad';p.fillRect(x-2,y-2,4,4)}p.stroke()}p.font=(w*.045)+'px Georgia';p.textAlign='center';p.fillText('CARTA   CŒLESTIS',cx,h*.91)}else if(mode==='garden'){p.save();p.beginPath();p.rect(w*.07,h*.06,w*.86,h*.84);p.clip();p.fillStyle='#c0d3c8';p.fillRect(0,0,w,h*.56);for(let j=0;j<170;j++){let x=R(0,w),y=R(h*.25,h*.69);p.fillStyle=pick(['#ac6643','#bd7542','#d4ab57','#8d925f','#d49b50','#b2a876']);p.beginPath();p.arc(x,y,R(3,18),0,TAU);p.fill()}p.fillStyle='#86aaa3';p.beginPath();p.ellipse(w*.36,h*.8,w*.36,h*.17,0,0,TAU);p.fill();p.strokeStyle='#aa4930';p.lineWidth=w*.03;for(let x of [.56,.77]){p.beginPath();p.moveTo(w*x,h*.36);p.lineTo(w*x,h*.72);p.stroke()}for(let y of [.35,.43]){p.beginPath();p.moveTo(w*.49,h*y);p.lineTo(w*.84,h*y);p.stroke()}p.restore()}else{p.strokeStyle='#756651';for(let j=0;j<4;j++){let x=R(.22,.75)*w,y=R(.18,.65)*h,s=w*.14;p.beginPath();for(let i=0;i<16;i++){let a=i*TAU/16,r=i%2?.43:1;p.lineTo(x+s*Math.cos(a)*r,y+s*Math.sin(a)*r)}p.closePath();p.stroke()}p.fillStyle='#766651';p.font=w*.055+'px Georgia';p.fillText('Étude   ·   Acer',w*.12,h*.86)}}}
art(-3.08,2.77,-4.489,1.65,1.51,artwork('stars'));sign(-5.73,2.82,-4.478,.62,1.29,'秋 星','#e2d2ae','#554d3b');for(let j=0;j<3;j++){let x=-2.04+j*.43,y=2.68+R(-.15,.15);art(x,y,-4.49,.37,.46,artwork('sketch'));box(x,y+.227,-4.478,.14,.034,.009,'#ccb986',0,0,.11)}
function shelf(x,y,z,w,h){for(let s of [-1,1])box(x+s*w*.5,y+h*.5,z,.075,h,.43,wood);for(let k=0;k<4;k++)box(x,y+k*h/3,z,w,.069,.46,wood);for(let j=0;j<3;j++){let a=x-w/2+.07;while(a<x+w/2-.09){let ww=R(.048,.105),hh=R(.19,h/3-.064);box(a+ww/2,y+.044+j*h/3+hh/2,z+.013,ww,hh,.34,pick(['#847441','#704e42','#7c8d82','#9d845c','#5c7078','#b39171']));box(a+ww/2,y+.09+j*h/3,z+.19,ww*.77,.026,.01,paper);a+=ww+.012}}}
shelf(-1.4,1.12,-4.18,1.66,1.42);ball(-1.01,2.84,-4.17,.205,.205,.205,'#719d9b');ring(-1.01,2.84,-4.17,.235,.016,gold,.14,.07,.18);cyl(-1.01,2.596,-4.17,.091,.09,wood);for(let j=0;j<6;j++)ball(-1.01+R(-.14,.15),2.84+R(-.12,.1),-4.008,.066,.047,.03,'#a3b27d');
table(-1.64,1.12,-3.44,1.69,.67,.55);function book(x,y,z,s){box(x,y,z,.54*s,.049*s,.34*s,'#77644e');for(let a of [-1,1]){box(x+a*.13*s,y+.034*s,z,.257*s,.028*s,.33*s,paper,0,0,a*.06);for(let j=0;j<7;j++)box(x+a*.13*s,y+.055*s,z+(.109-j*.035)*s,.19*s,.004,.006*s,'#9b9481')}}
book(-1.7,1.734,-3.4,1);cyl(-1.06,1.78,-3.47,.061,.13,'#3c5761');rod(-1.27,1.74,-3.33,-1.13,1.74,-3.21,.012,ink);ring(-1.97,1.75,-3.23,.064,.008,gold,1.57);function lamp(x,y,z,s){cyl(x,y+.025*s,z,.13*s,.05*s,gold);rod(x,y,z,x,y+.39*s,z,.025*s,gold);cyl(x,y+.39*s,z,.19*s,.21*s,'#e4c88b',.45)}lamp(-2.26,1.73,-3.49,.82);
table(-5.55,1.11,-4.09,1.57,.57,.63);box(-5.55,1.51,-4.09,1.43,.44,.53,'#79513a');for(let a of [-1,1]){box(-5.55+a*.37,1.51,-3.812,.647,.35,.025,'#916849');ball(-5.55+a*.11,1.52,-3.79,.035,.025,.02,gold)}pot(-5.89,1.799,-4.1,.143,'#718a80');for(let j=0;j<8;j++)bloom(-5.89+R(-.08,.08),1.94,-4.1+R(-.06,.06),R(.15,.4),pick(mapCols));box(-5.21,1.949,-4.1,.53,.31,.21,'#b08c61');sign(-5.21,1.95,-3.988,.44,.22,'◉  ▤','#a98b61','#4f493b');
const ox=-3.46,oz=-2.18,oy=2.15;cyl(ox,1.23,oz,.48,.21,wood,1.08,12);cyl(ox,1.37,oz,.46,.075,gold,1,12);cyl(ox,1.49,oz,.26,.19,wood,.8);ball(ox,1.59,oz,.29,.11,.29,'#937043');for(let i=0;i<12;i++){let a=i*TAU/12;ball(ox+Math.cos(a)*.48,1.246,oz+Math.sin(a)*.48,.033,.032,.033,gold)}
const core=mesh(new T.SphereGeometry(.335,36,28),0,ox,oy,oz,new T.MeshBasicMaterial({color:0x95e9ef}));const orbs=[];
// The orbits share a centre; two broad engraved circles rotate inside fine guide hoops.
function bronzeCircle(radius,width,thickness,finish){
  const points=[],uvs=[],indices=[],segments=160;
  const section=[[-width/2,-thickness/2],[width/2,-thickness/2],[width/2,thickness/2],[-width/2,thickness/2]];
  for(let side=0;side<4;side++){
    const first=points.length/3,next=(side+1)%4;
    for(let j=0;j<=segments;j++){
      const angle=j*TAU/segments;
      for(const [edge,vertical] of [[side,0],[next,1]]){
        const [offset,z]=section[edge],r=radius+offset;
        points.push(r*Math.cos(angle),r*Math.sin(angle),z);
        uvs.push(j/segments,side===2?1-vertical:vertical);
      }
      if(j){const k=first+j*2;indices.push(k-2,k,k+1,k-2,k+1,k-1)}
    }
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points,3));g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
  g.setIndex(indices);g.computeVertexNormals();
  return new T.Mesh(g,finish);
}
function engravedScale(blue){
  return canvasTex(2048,120,(p,w,h)=>{
    const grad=p.createLinearGradient(0,0,0,h);
    const tones=blue?['#ceb98a','#526a6a','#42595b','#60726a','#d5ba7f']:['#9b733c','#f0d295','#d5ad68','#e8c687','#98703f'];
    [0,.1,.48,.88,1].forEach((stop,i)=>grad.addColorStop(stop,tones[i]));p.fillStyle=grad;p.fillRect(0,0,w,h);
    p.strokeStyle=blue?'#e7cc91':'#725531';p.lineWidth=1.5;
    for(let k=0;k<180;k++){const x=k*w/180,len=k%15===0?32:k%5===0?23:12;p.beginPath();p.moveTo(x,8);p.lineTo(x,8+len);p.moveTo(x,h-8);p.lineTo(x,h-8-len*.75);p.stroke()}
    p.fillStyle=blue?'#f0d597':'#71502f';p.textAlign='center';p.textBaseline='middle';p.font='26px Georgia';
    for(let k=0;k<12;k++){let x=w*(k+.5)/12;p.fillText(blue?['ARI','TAU','GEM','CNC','LEO','VIR','LIB','SCO','SGR','CAP','AQR','PSC'][k]:String(k*30)+'°',x-(blue?29:0),h*.54);if(blue){p.beginPath();for(let n=0;n<5;n++){let X=x+6+n*10,Y=h*.48+Math.sin(n*2.9+k*1.72)*12;if(n)p.lineTo(X,Y);else p.moveTo(X,Y);p.fillRect(X-1.75,Y-1.75,3.5,3.5)}p.stroke()}}
    p.lineWidth=1;p.beginPath();p.moveTo(0,h*.08);p.lineTo(w,h*.08);p.moveTo(0,h*.92);p.lineTo(w,h*.92);p.stroke();
  });
}
const giltFinish=new T.MeshToonMaterial({color:'#e0bb79',gradientMap:grad});
const dialFinish=[false,true].map(blue=>new T.MeshToonMaterial({map:engravedScale(blue),gradientMap:grad,side:T.DoubleSide}));
for(let i=0;i<5;i++){
  const axis=new T.Group(),radius=.448+i*.045;axis.position.set(ox,oy,oz);world.add(axis);
  const wide=i===2||i===4;
  let circle=wide?bronzeCircle(radius,i===4?.054:.043,.016,dialFinish[i===2?1:0]):new T.Mesh(new T.TorusGeometry(radius,.0115,9,100),giltFinish);
  axis.add(circle);
  if(wide)for(let side of [-1,1]){
    const lip=new T.Mesh(new T.TorusGeometry(radius+side*(i===4?.027:.0215),.0048,6,100),giltFinish);lip.position.z=.007;axis.add(lip);
  }
  const satellite=new T.Mesh(sphereG,new T.MeshToonMaterial({color:i%2?'#f2d092':'#90cbd4',gradientMap:grad}));
  satellite.scale.setScalar(.028+i*.0064);satellite.position.x=radius;axis.add(satellite);
  orbs.push(axis);
  anim.push(t=>axis.rotation.set(Math.sin(t*.085)*(i*.27)+i*.51,.4+t*(i%2?.12:-.1),i*.41+t*.045));
}
const haloTex=canvasTex(128,128,(p)=>{let g=p.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(146,245,255,.75)');g.addColorStop(.38,'rgba(126,237,251,.38)');g.addColorStop(1,'rgba(108,216,245,0)');p.fillStyle=g;p.fillRect(0,0,128,128)});let halo=new T.Sprite(new T.SpriteMaterial({map:haloTex,depthWrite:false,transparent:true,blending:T.AdditiveBlending}));halo.position.set(ox,oy,oz);halo.scale.setScalar(1.8);world.add(halo);
for(let k=0;k<43;k++){let a=R(0,TAU),r=R(.4,.85),y=R(-.5,.59);moving(sphereG,ox,oy+y,oz,'#fff1b8',.012,.012,.012,(o,t)=>{o.position.x=ox+Math.cos(a+t*.11)*r;o.position.z=oz+Math.sin(a+t*.11)*r;o.position.y=oy+y+.05*Math.sin(a+t*.48)})}
for(let j=0;j<36;j++)ball(-3.4+R(-1.12,1.12),R(2.4,3.9),-4.46,.013,.013,.009,'#e3dcaf');
function teapot(x,y,z,s,c){ball(x,y+.12*s,z,.16*s,.135*s,.145*s,c);cyl(x,y+.23*s,z,.094*s,.045*s,c);ball(x,y+.275*s,z,.028*s,.025*s,.028*s,gold);rod(x+.12*s,y+.13*s,z,x+.22*s,y+.2*s,z,.048*s,c,.65);ring(x-.135*s,y+.14*s,z,.092*s,.019*s,c)}
function cup(x,y,z,s){cyl(x,y+.039*s,z,.06*s,.077*s,paper,1.18);cyl(x,y+.079*s,z,.057*s,.008*s,'#987747')}
table(-2.03,1.12,-.92,1.4,.82,.33);for(let a of [-1,1]){box(-2.03+a*.95,1.166,-.86,.58,.096,.59,a<0?'#798889':'#b06a52');box(-2.03+a*.95,1.22,-.86,.49,.018,.51,a<0?'#91a3a0':'#b7795e')}teapot(-2.23,1.505,-1.03,.87,'#686e65');cup(-2.12,1.51,-.73,.92);cup(-2.4,1.51,-.77,.8);book(-1.65,1.52,-.98,.76);for(let a of [-1,1])ring(-1.65+a*.053,1.57,-.99,.046,.006,ink,1.54);cyl(-1.79,1.53,-.67,.11,.025,'#b6b5a3');
pot(-1.02,1.12,-1.6,.227,'#8e684f');teapot(-1.02,1.35,-1.6,.87,'#50544e');
function steam(x,y,z){for(let j=0;j<4;j++){let o=mesh(sphereG,0,x,y,z,new T.MeshBasicMaterial({color:'#fff3d6',transparent:true,opacity:.2,depthWrite:false}));anim.push(t=>{let u=(t*.33+j*.25)%1;o.position.set(x+.033*Math.sin(t+u*5)-windStrength(t,x,z)*.17*u*u,y+u*.33,z);o.scale.set(.015+u*.023,.041,.013);o.material.opacity=.24*Math.sin(u*Math.PI)})}}steam(-2.12,1.58,-.73);steam(-.84,1.55,-1.6);
let ex=-4.9,ez=-1.11;for(let a of [-1,1])rod(ex+a*.38,1.12,ez+.17,ex+a*.12,2.64,ez-.12,.038,lightwood);rod(ex,1.12,ez-.5,ex,2.62,ez-.12,.042,wood);box(ex,2.04,ez,.78,.89,.07,lightwood,-.12);art(ex,2.052,ez+.042,.702,.802,artwork('garden'),-.12);box(ex,1.61,ez+.08,.89,.065,.15,wood);
table(-5.86,1.12,-1.89,.73,.54,.48);ball(-5.69,1.19,-1.26,.17,.024,.12,'#ceb082');for(let k=0;k<6;k++)ball(-5.69+Math.cos(k)*.11,1.214,-1.26+Math.sin(k)*.059,.027,.009,.028,flowerPalette[k]);pot(-5.43,1.12,-1.28,.09,'#9caa9b');for(let k=0;k<9;k++){
  let X=-5.43+R(-.071,.075),Y=1.53+R(-.035,.099),Z=-1.28+R(-.064,.064),base=[-5.43,1.22,-1.28];
  const end=V(X,Y,Z),direction=end.clone().sub(V(...base)).normalize(),ferrule=end.clone().addScaledVector(direction,.051);
  rod(...base,X,Y,Z,.009,k%3?wood:'#9a724e',.84,8);
  rod(X,Y,Z,ferrule.x,ferrule.y,ferrule.z,.011,'#bac2b5',1.1,10);
  const tip=ferrule.clone().addScaledVector(direction,.042+k%3*.011);
  rod(ferrule.x,ferrule.y,ferrule.z,tip.x,tip.y,tip.z,.013,k%3===0?'#866070':'#795c42',.16,10);
}
for(let k=0;k<4;k++){let o=art(-4.67+R(-.55,.73),1.121+k*.002,-.68+R(-.17,.31),.32,.41,artwork('sketch'),-Math.PI/2);o.rotation.z=R(-.41,.33)}
// Flower stall, galvanized buckets and hand lettered timber sign.
table(-5.52,1.077,.48,1.88,.54,.53);box(-5.52,1.52,.48,1.79,.22,.49,lightwood);for(let a of [-1,1]){box(-5.52+a*.44,1.52,.734,.82,.17,.04,'#a98259');ball(-5.52+a*.44,1.52,.763,.04,.025,.022,ink)}
// The florist's benches and handwritten board leave space for the wrapping tools.
box(-5.44,1.29,.974,.73,.331,.045,'#75593c',-.12);
for(let a of [-1,1])for(let b of [-1,1])rod(-.73+a*.19,1.07,.49+b*.12,-.73,1.93,.49,.026,wood);rod(-.73,1.69,.49,-.73,2.03,.49,.033,gold);rod(-.94,1.94,.57,-.4,2.21,.29,.079,gold,1.35);rod(-.425,2.19,.299,-.367,2.22,.271,.119,'#5d6662');rod(-.965,1.927,.577,-.921,1.948,.559,.046,ink);
let fan=new T.Group();fan.position.set(-3.26,3.77,-2.25);world.add(fan);rod(-3.26,3.75,-2.25,-3.26,4.07,-2.25,.023,wood);for(let k=0;k<4;k++){let o=new T.Mesh(sphereG,new T.MeshToonMaterial({color:lightwood,gradientMap:grad})),a=k*TAU/4;o.position.set(Math.cos(a)*.28,0,Math.sin(a)*.28);o.rotation.y=-a;o.scale.set(.31,.018,.076);fan.add(o)}anim.push(t=>fan.rotation.y=t*.41);
const planetMobile=new T.Group();world.add(planetMobile);
planetMobile.position.set(-1.59,3.76,-3.09);
rod(-1.59,4.03,-3.09,-1.59,3.76,-3.09,.009,gold);
for(let j=0;j<6;j++){
  let angle=j*2.4,r=.19+.074*j,xx=Math.cos(angle)*r,zz=Math.sin(angle)*r,drop=.13+(j%3)*.11;
  const mobileArm=new T.Mesh(cylG(),new T.MeshToonMaterial({color:gold,gradientMap:grad}));
  mobileArm.scale.set(.009,r,.009);mobileArm.position.set(xx/2,0,zz/2);
  mobileArm.quaternion.setFromUnitVectors(V(0,1,0),V(xx,0,zz).normalize());planetMobile.add(mobileArm);
  let thread=new T.Mesh(cylG(),new T.MeshBasicMaterial({color:'#9c8a66'}));
  thread.scale.set(.0045,drop,.0045);thread.position.set(xx,-drop/2,zz);planetMobile.add(thread);
  let body=new T.Mesh(sphereG,new T.MeshToonMaterial({color:['#b58b66','#ccb78e','#77a5ac','#bd7255','#b69d70','#839d9e'][j],gradientMap:grad}));
  body.position.set(xx,-drop,zz);body.scale.setScalar(.043+.009*j);planetMobile.add(body);
  if(j===4){let band=new T.Mesh(new T.TorusGeometry(.101,.008,6,32),new T.MeshBasicMaterial({color:'#d9c39b'}));band.position.copy(body.position);band.rotation.x=1.21;planetMobile.add(band)}
}
anim.push(t=>planetMobile.rotation.y=.095*t);
world=gardenRoot;
