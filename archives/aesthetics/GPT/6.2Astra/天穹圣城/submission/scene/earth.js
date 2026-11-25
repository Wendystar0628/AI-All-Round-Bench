'use strict';

// Transparent botanical sprays sit over a darker interior canopy. Each spray
// is hand-constructed from branching stems and pairs of sunlit leaflets.
function botanicalPlate(needle){
  const remembered=seed;seed=needle?86423:31918;
  const paper=document.createElement('canvas');paper.width=192;paper.height=224;
  const cx=paper.getContext('2d');
  function leaflet(x,y,angle,len,width,tone){
    cx.save();cx.translate(x,y);cx.rotate(angle);
    const g=cx.createLinearGradient(0,-width,0,width);
    g.addColorStop(0,needle?'#455e39':'#52693e');g.addColorStop(.49,tone);g.addColorStop(.53,needle?'#829263':'#a4ae7d');g.addColorStop(1,tone);
    cx.fillStyle=g;cx.beginPath();cx.moveTo(0,0);cx.quadraticCurveTo(len*.53,-width*1.35,len,0);
    cx.quadraticCurveTo(len*.49,width*.71,0,0);cx.fill();cx.restore();
  }
  function stem(x,y,ex,ey,depth,width){
    const dx=ex-x,dy=ey-y,a=Math.atan2(dy,dx);
    cx.strokeStyle=depth===0?'#6b6847':'#738452';cx.lineWidth=width;
    cx.beginPath();cx.moveTo(x,y);cx.quadraticCurveTo(x+dx*.55-2,y+dy*.44,ex,ey);cx.stroke();
    const pairs=needle?13:8;
    for(let i=1;i<=pairs;i++)for(const side of [-1,1]){
      const t=(i-.42)/pairs,px=x+t*dx+rand(-2,2),py=y+t*dy+rand(-1,1);
      const aa=a+side*rand(.43,1.0),length=(1.18-t*.63)*rand(needle?14:16,needle?24:25);
      const color=pick(needle?['#607846','#748955','#516d44','#83915c']:['#748955','#94a06a','#879466','#677f52','#9da779']);
      leaflet(px,py,aa,length,needle?rand(1.3,2.6):rand(2.8,4.8),color);
    }
  }
  stem(95,221,97,15,0,3.2);
  for(let j=0;j<9;j++)for(const side of [-1,1]){
    const y=202-j*19.4,w=(86-j*6.7)*rand(.82,1.07),ex=96+side*w,ey=y-rand(28,47);
    stem(96,y,ex,ey,1,2.0);
    for(let k=0;k<3;k++){const f=.32+k*.23;stem(mix(96,ex,f),mix(y,ey,f),mix(96,ex,f)+side*w*.17,mix(y,ey,f)-rand(12,27),2,1.1);}
  }
  const texture=new T.CanvasTexture(paper);texture.colorSpace=T.SRGBColorSpace;seed=remembered;return texture;
}
for(const key of ['oliveLeaves','cypressLeaves']){
  M[key]=new T.MeshStandardMaterial({map:botanicalPlate(key==='cypressLeaves'),alphaTest:.36,alphaToCoverage:true,vertexColors:true,side:T.DoubleSide,roughness:.95,metalness:0,envMapIntensity:.28});
}
function sprays(type,v){
  return geometry('sprays'+type+v,()=>{
    const save=seed;seed=11319+v*113+(type==='cypress'?761:2973);
    const pos=[],norm=[],uv=[],ind=[],col=[];
    const fir=type==='cypress',bush=type==='bush',n=fir?204:bush?132:219;
    for(let i=0;i<n;i++){
      const a=i*2.39996+rand(-.40,.40),s=sin(a),c=cos(a),t=rand(.01,.995),u=rand(.41,1.);
      const r=fir?.146*Math.pow(sin(PI*(t*.9+.062)),.68)*(1.-t*.30)*u:(bush?.88:.419)*Math.sqrt(t)*u;
      const y=fir?.12+t*.81:bush?.25+.55*Math.sqrt(1-t)+rand(-.18,.14):.63+.26*Math.sqrt(1-t)+rand(-.082,.095);
      const w=fir?rand(.068,.13)*(1.-.41*t):bush?rand(.33,.56):rand(.131,.247);
      const h=fir?w*1.65:bush?w*.95:w*1.03;
      const pitch=fir?rand(.28,.66):rand(.27,1.16),lean=rand(-.25,.25);
      const x=s*r,z=c*r,k=i*4,shade=rand(.76,1.16)*(.81+.21*y);
      for(const [side,top] of [[-.5,0],[.5,0],[.5,1],[-.5,1]]){
        const out=h*top*sin(pitch);
        pos.push(x+c*(side*w+lean*h*top)+s*out,y+h*(top-.20)*cos(pitch),z-s*(side*w+lean*h*top)+c*out);
        const nn=V(s*.76,.53+y*.27,c*.76).normalize();norm.push(nn.x,nn.y,nn.z);
        uv.push(side+.5,top);col.push(shade*.98,shade,shade*(fir?.88:.94));
      }
      ind.push(k,k+1,k+2,k,k+2,k+3);
    }
    const geo=rawGeo(pos,ind,col,uv);geo.setAttribute('normal',new T.Float32BufferAttribute(norm,3));seed=save;return geo;
  });
}

function coloredLump(variant,detail=1,foliage=false) {
  return geometry('lump'+variant+','+detail+','+foliage,()=>{
    const g=new T.IcosahedronGeometry(1,detail),p=g.attributes.position,c=[];
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      const shift=noise2(x*4+variant*4.2+z*.7,y*4+z*1.9)-.5;
      const k=1+shift*(foliage?.27:.35);
      p.setXYZ(i,x*k,y*k,z*k);
      const color=new T.Color(foliage?0x98a966:0x9b9180);
      color.multiplyScalar(foliage?(.71+.22*y+shift*.49):(.76+.16*y+shift*.31));c.push(color.r,color.g,color.b);
    }
    g.computeVertexNormals();g.setAttribute('color',new T.Float32BufferAttribute(c,3));return g;
  });
}
function rockChip(p,x,y,z,w,h,d,j=0) {
  const m=mesh(p,coloredLump(j%7,0),'rock',x,y,z);m.scale.set(w,h,d);m.rotation.set(rand(-.35,.35),rand(0,TAU),rand(-.27,.27));return m;
}
function crownGeometry(type,variant) {
  return geometry('tree'+type+variant,()=>{
    const pos=[],color=[];const fir=type==='cypress';
    function crown(x,y,z,rx,ry,rz,tint,num) {
      const g=coloredLump(num%6,1,true),a=g.attributes.position,base=new T.Color(tint);
      for(let i=0;i<a.count;i+=3){
        const v=.72+rand(0,.24)+.13*(a.getY(i)+1)*.5+.085*y;
        for(let j=0;j<3;j++){
          const px=a.getX(i+j),py=a.getY(i+j),pz=a.getZ(i+j);
          pos.push(x+rx*px,y+ry*py,z+rz*pz);
          const occl=clamp(.76+.23*py+.08*y,.53,1.13);
          color.push(base.r*v*occl,base.g*v*occl,base.b*v*(occl+.02));
        }
      }
    }
    if(fir){
      for(let i=0;i<32;i++){
        const y=i/34,a=i*2.399+variant*.4;const r=.135*Math.pow(sin(PI*(y*.86+.11)),.67)*(1-.31*y);
        const clr=pick([0x627a50,0x506b4c,0x73855a,0x486347,0x668258]);
        crown(cos(a)*r*.56,.105+y*.83,sin(a)*r*.58,r*rand(.61,.9),rand(.107,.167)*(1.16-.40*y),r*.83,clr,i);
      }
      crown(.012,.92,.001,.043,.118,.038,0x688054,3);
    } else {
      for(let i=0;i<24;i++){
        const a=i*2.399+variant*.7,r=Math.sqrt(i/23)*.34,y=.65+.21*(1-r/.34)+rand(-.08,.09);
        crown(cos(a)*r,y,sin(a)*r,rand(.14,.235),rand(.12,.177),rand(.14,.22),pick([0x889366,0x7d945d,0x9aa275,0x798e5d,0xa1a179]),i);
      }
    }
    return rawGeo(pos,null,color);
  });
}
M.leaf.color.set(0xffffff);
function tree(p,x,y,z,h=2.8,type='cypress',sway=false) {
  const g=group(p,x,y,z,rand(0,TAU));
  const fir=type==='cypress';
  if(!fir){
    rod(g,[0,0,0],[-.025*h,.46*h,.014*h],.074*h,.042*h,'bark',8);
    for(let j=0;j<4;j++){const a=j*TAU/4+.3;rod(g,[-.02*h,.28*h,0],[cos(a)*.28*h,.64*h,sin(a)*.20*h],.038*h,.014*h,'bark',7);}
  }else cyl(g,0,h*.14,0,h*.045,h*.027,h*.28,'bark',7);
  const variant=Math.floor(rand(0,5));
  const top=mesh(g,crownGeometry(type,variant),'leaf');top.scale.set(h*.65,h*.86,h*.65);
  const leaves=mesh(g,sprays(type,variant),fir?'cypressLeaves':'oliveLeaves');leaves.scale.setScalar(h);
  if(sway){const k=rand(0,8);moving(g,t=>{g.rotation.z=.012*sin(t*.72+k)+.008*sin(t*.39+k);});}
  return g;
}
function shrub(p,x,y,z,r=.55) {
  const v=Math.floor(rand(0,6)),g=group(p,x,y,z,rand(0,TAU));
  const o=mesh(g,coloredLump(v,1,true),'leaf',0,r*.28,0);o.scale.set(r*.57,r*.40,r*.50);
  const l=mesh(g,sprays('bush',v),'oliveLeaves');l.scale.set(r,r*.80,r*.92);return g;
}
function ivy(p,x,y,z,len,width=.37,az=0,flowers=false) {
  const q=group(p,x,y,z,az),steps=Math.max(3,Math.floor(len/.45)),phase=rand(0,6);
  const leaves=[],colors=[];
  const leaf=(ax,ay,az,s,dx)=>{
    const a=[ax,ay,az],b=[ax+dx*s*.77,ay-.13*s,az+.20*s],c=[ax+dx*s*1.24,ay-.83*s,az+.17*s],d=[ax+dx*s*.27,ay-.66*s,az+.28*s],e=[ax+dx*s*.51,ay-.35*s,az+.32*s];
    for(const tri of [[a,b,e],[b,c,e],[c,d,e],[d,a,e]]){
      const col=new T.Color(pick([0x516b40,0x778a46,0x8a954f,0x5d804e,0x557c4c]));
      for(const q of tri){leaves.push(...q);colors.push(col.r,col.g,col.b);}
    }
  };
  for(let j=0;j<=steps;j++){
    const f=j/steps,xx=sin(f*7+phase)*width*.55,yy=-f*len,zz=.20*sin(f*PI);
    const w=width*(1-.66*f);
    for(let k=0;k<19;k++)leaf(xx+rand(-w,w),yy+rand(0,.38),zz+rand(-.07,.13),rand(.105,.28),k%2?1:-1);
    if(flowers&&j<steps*.72&&j%2===0)for(let k=0;k<4;k++)orb(q,xx+rand(-.13,.13),yy+rand(-.10,.12),zz+.15,.063,.053,.052,'blossom',7);
  }
  const pts=Array.from({length:7},(_,j)=>[sin(j/6*7+phase)*width*.55,-j/6*len,.20*sin(j/6*PI)]);
  tube(q,pts,.024,'bark',10,4);
  const geo=rawGeo(leaves,null,colors);mesh(q,geo,'leaf');
}
function gem(p,x,y,z,w,h,tilt=0) {
  const g=group(p,x,y,z,rand(0,TAU));g.rotation.z=tilt;
  const ps=[],cs=[];
  const tri=(a,b,c,col,cur)=>{ps.push(...a,...b,...c);for(const a of [cur[0],cur[1],cur[2]]){const k=col.clone().multiplyScalar(a);cs.push(k.r,k.g,k.b);}};
  const n=6,levels=[[0,.12],[-h*.12,w*.75],[-h*.64,w],[-h*.82,w*.71],[-h,w*.025]];
  for(let i=0;i<n;i++){
    const col=new T.Color([0x9eedee,0x5fcace,0xc7f9ef,0x76cbd9,0x3ea2bb,0x9ddadd][i]);
    for(let j=0;j<levels.length-1;j++){
      const pt=(v,k)=>[cos(k*TAU/n)*levels[v][1]+w*.17*v/4,levels[v][0],sin(k*TAU/n)*levels[v][1]];
      const a=pt(j,i),b=pt(j,i+1),c=pt(j+1,i+1),d=pt(j+1,i);
      tri(a,b,d,col,[.80+j*.055,.84+j*.06,1.0]);tri(b,c,d,col,[.84+j*.06,1.04,1.0]);
    }
  }
  mesh(g,rawGeo(ps,null,cs),'shard');return g;
}
function crystalBunch(p,x,y,z,scale,count=8) {
  const g=group(p,x,y,z);
  gem(g,0,0,0,scale*.23,scale*1.27,.09);
  for(let i=1;i<count;i++){
    const a=i*2.399,r=rand(.16,.69)*scale;
    gem(g,r*cos(a),rand(-.06,.29)*scale,r*sin(a),scale*rand(.09,.20),scale*rand(.38,1.02),rand(-.34,.34));
  }
  const s=aura(g,0,-.59*scale,.05,scale*2.8,0x72e3ec,.23);
  const ph=rand(0,5);ticking.push(t=>{s.material.opacity=.19+.055*sin(t*.67+ph);});
}
const inhabitedCliffs=[];
function island(p,rx,rz,depth,main=false,distant=false) {
  const n=main?96:(distant?35:54),ny=main?27:17,phi=rand(0,TAU);
  const vertices=[],colors=[],indices=[];const coord=[];
  const loci=Array.from({length:n},(_,i)=>{const a=i*TAU/n;return noise2(cos(a)*7+phi,sin(a)*7+phi)-.5;});
  for(let j=0;j<=ny;j++){
    const v=j/ny;
    const profile=1.-.20*v-.76*Math.pow(v,1.47)+.043*sin(PI*Math.min(1,v*5));
    const ox=rx*.097*v*sin(phi+4*v),oz=rz*.096*v*cos(phi+3*v);
    const ring=[];
    for(let i=0;i<n;i++){
      const a=i*TAU/n,co=sin(a),si=cos(a);
      const faults=noise2(co*4.1+v*2.1+phi,si*4.1+v*1.25)-.5;
      const split=.025*sin(v*ny*1.65+floorZone(a)*.77)+.011*sin(9*a+j*.38);
      let r=profile*(1+(.07+v*.29)*sin(3*a+phi+.51*v)+.065*sin(7*a+phi)+loci[i]*(.14+.27*v)+faults*.20+split);
      if(main){
        const da=Math.min(a,TAU-a),side=Math.atan2(sin(a+.83),cos(a+.83));
        r-=.275*Math.exp(-Math.pow(da/.224,6))*Math.exp(-Math.pow((v-.28)/.225,8));
        r-=.24*Math.exp(-side*side/.024)*Math.exp(-Math.pow((v-.29)/.14,4));
      }
      const y=-v*depth+(faults*depth*.12+loci[i]*depth*.059)*Math.min(1,v*6)+sin(a*3.0+phi)*.016*depth*(1-v);
      let X=ox+co*rx*r,Z=oz+si*rz*r;
      ring.push([X,y,Z]);
      const moss=v<.06&&loci[i]+faults>-.15;
      let color=new T.Color(moss?0x858762:0x9a8f80);
      color.lerp(new T.Color(0x69757b),clamp(v*.48+faults*.37,0,.59));
      const strata=.86+.14*sin(v*35+1.5*co+phi)+.17*faults;
      color.multiplyScalar(strata*(.91+.28*loci[i])*(1.-.19*v));
      vertices.push(X,y,Z);colors.push(color.r,color.g,color.b);
    }
    coord.push(ring);
  }
  for(let j=0;j<ny;j++)for(let i=0;i<n;i++){
    const a=j*n+i,b=j*n+(i+1)%n,c=b+n,d=a+n;
    if((i+j)%2)indices.push(a,d,b,b,d,c);else indices.push(a,c,b,a,d,c);
  }
  // The irregular face normals keep cleaved ledges crisp against the cloud sea.
  let rockGeo=rawGeo(vertices,indices,colors).toNonIndexed();
  rockGeo.computeVertexNormals();mesh(p,rockGeo,'rock');
  const capPos=[0,.03,0],capI=[];
  for(const v of coord[0])capPos.push(...v);
  for(let i=0;i<n;i++)capI.push(0,1+i,1+((i+1)%n));
  mesh(p,rawGeo(capPos,capI),'grass');
  if(distant)return;
  if(main||rx>4){
    const points=vertices.slice(),faces=indices.slice(),top=points.length/3;
    points.push(0,.03,0);
    const toe=coord[ny].reduce((v,pt)=>v.add(V(...pt)),V()).divideScalar(n);
    points.push(toe.x,toe.y-.015,toe.z);
    for(let i=0;i<n;i++){
      const next=(i+1)%n;faces.push(top,i,next,top+1,ny*n+next,ny*n+i);
    }
    const shell=new T.Mesh(rawGeo(points,faces),new T.MeshBasicMaterial({side:T.DoubleSide}));
    p.updateWorldMatrix(true,false);shell.matrixAutoUpdate=false;shell.matrixWorld.copy(p.matrixWorld);
    shell.geometry.computeBoundingBox();
    const bounds=shell.geometry.boundingBox.clone().applyMatrix4(shell.matrixWorld).expandByScalar(.5);
    inhabitedCliffs.push({shell,bounds});
  }
  const needles=main?49:15;
  for(let i=0;i<needles;i++){
    const j=Math.floor(rand(ny*.19,ny*.88)),k=Math.floor(rand(0,n));const q=coord[j][k],s=main?rand(.52,1.50):rand(.28,.74);
    const o=rockChip(p,q[0]*.97,q[1]-.22*s,q[2]*.97,s*rand(.7,1.25),s*rand(1.5,3.4),s*.80,i);
    o.rotation.z=rand(-.17,.17);
  }
  // Fractured plates follow the cliff contours, leaning into the core below.
  const savedSeed=seed;
  for(let i=0;i<(main?51:17);i++){
    const j=Math.floor(rand(ny*.13,ny*.82)),k=Math.floor(rand(0,n)),p0=coord[j][k],a=k*TAU/n;
    if(main&&Math.min(a,TAU-a)<.19&&j<ny*.48)continue;
    const w=rand(.045,.113)*rx,down=rand(.12,.32)*depth,th=rand(.33,.73)*w;
    const bed=group(p,p0[0],p0[1],p0[2],a+rand(-.12,.12)),ps=[],cs=[],idx=[];
    const rings=[[.0,.72],[-.12,1.0],[-.53,.95],[-.90,.47],[-1.0,.10]],nside=7;
    const stone=new T.Color(pick([0x8a8276,0x817e74,0x8f8274,0x77817c]));
    for(let jj=0;jj<rings.length;jj++)for(let s=0;s<nside;s++){
      const angle=s*TAU/nside,rr=rings[jj][1]*(1.+.13*sin(s*4.+i));
      ps.push(w*rr*cos(angle)+w*.22*jj/4,down*rings[jj][0]+.12*w*sin(angle*3+i),th*rr*sin(angle)-jj/4*down*.38);
      const c=stone.clone().multiplyScalar((1.05-jj*.037)*(.90+.14*sin(s*3+i)));cs.push(c.r,c.g,c.b);
      const id=jj*nside+s,next=jj*nside+(s+1)%nside;if(jj<4)idx.push(id,next,id+nside,next,next+nside,id+nside);
      if(jj===0&&s>0&&s<nside-1)idx.push(0,s+1,s);
    }
    const sh=rawGeo(ps,idx,cs).toNonIndexed();sh.computeVertexNormals();mesh(bed,sh,'rock');
  }
  seed=savedSeed;
  for(let i=0;i<(main?48:16);i++){
    const k=Math.floor(rand(0,n)),q=coord[0][k],a=k*TAU/n;
    if(main&&Math.abs(q[0])<3.34&&q[2]>15)continue;
    shrub(p,q[0]*.99,q[1]-.08,q[2]*.99,rand(.48,main?1.45:.9));
    if(i%2===0)ivy(p,q[0]*1.015,q[1]+.19,q[2]*1.015,rand(1.1,main?5.1:2.5),rand(.26,.67),a,i%7===0);
  }
  const bot=coord[ny][0];crystalBunch(p,bot[0],-depth*.958,bot[2],main?5.9:Math.max(1.20,rx*.26),main?14:5);
  for(let i=0;i<(main?7:2);i++){
    const a=Math.floor(rand(0,n)),v=Math.floor(rand(ny*.33,ny*.80)),pt=coord[v][a];
    crystalBunch(p,pt[0]*1.02,pt[1],pt[2]*1.02,main?rand(1.3,2.9):rand(.55,1.1),main?5:3);
  }
  for(let i=0;i<(main?13:4);i++){
    const a=Math.floor(rand(0,n)),v=Math.floor(rand(ny*.17,ny*.6)),q=coord[v][a],l=rand(1.4,main?5.3:3);
    tube(p,[q,[q[0]*1.02,q[1]-l*.29,q[2]*1.02],[q[0]*.98+.3,q[1]-l*.63,q[2]*.97],[q[0]*.96+.5,q[1]-l,q[2]*.95]],.07,'bark',12,5);
  }
  if(main){
    const keep=seed;
    for(let i=0;i<62;i++){
      const k=Math.floor(rand(0,n)),q=coord[0][k],a=k*TAU/n;
      if(q[2]>15&&Math.abs(q[0])<3.1)continue;
      const l=rand(1.7,4.9),g=group(p,q[0]*1.009,q[1],q[2]*1.009,a);
      ivy(g,.04,.085,.20,l,rand(.24,.55),0,i%6===0);
    }
    seed=keep;
  }
  function floorZone(a){return Math.floor(a*2.3);}
}
function sculpture(p,x,y,z,h,style=0,mat='statue') {
  const g=group(p,x,y,z);g.scale.setScalar(h/3.6);
  const role=style%6;
  cyl(g,0,.12,0,.84,.79,.24,'sand',8,PI/8);box(g,0,.30,.01,1.18,.18,1.02,'trim');
  const stance=style%2===0?1:-1;
  for(const side of [-1,1])orb(g,side*.20,.42,.11+side*.07,.205,.13,.31,mat,8);
  const robe=lineProfile(g,0,.40,0,1,1,[[.61,0],[.64,.12],[.50,.8],[.36,1.49],[.40,1.68]],mat,14);robe.scale.z=.70;
  for(let j=0;j<11;j++){const a=j*TAU/11;rod(g,[sin(a)*.60,.48,cos(a)*.43],[sin(a+.13)*.34,2.00,cos(a+.13)*.27],.066,.035,mat,5);}
  const torso=orb(g,0,2.15,0,.465,.55,.294,mat,10);torso.rotation.z=stance*.06;
  const mantle=orb(g,0,2.51,-.018,.58,.257,.34,mat,10);mantle.rotation.z=stance*.10;
  for(const s of [-1,1]) {
    const elbow=[s*.55,2.03+(s===stance?.09:0),.11],hand=[s*.114+.16*stance,1.97+(s===stance?.12:0),.48];
    if(role===1||role===2){hand[0]=s*.27;hand[1]=2.02;hand[2]=.47;}
    if(role===4){hand[0]=s*.18+.28;hand[1]=s===1?2.18:1.84;}
    rod(g,[s*.43,2.5,.01],elbow,.195,.138,mat,9);rod(g,elbow,hand,.138,.083,mat,8);orb(g,...hand,.096,.10,.116,mat,9);
  }
  cyl(g,0,2.76,0,.165,.16,.30,mat,10);
  orb(g,0,3.00,.028,.249,.335,.228,mat,12);
  orb(g,0,3.11,-.038,.27,.29,.227,mat,10);
  for(const ss of [-1,1]){
    const brow=orb(g,ss*.088,3.072,.227,.092,.040,.054,mat,8);brow.rotation.z=ss*.17;
    orb(g,ss*.087,3.026,.232,.063,.023,.033,'aged',8);
    orb(g,ss*.146,2.978,.199,.079,.087,.061,mat,8);
    for(let j=0;j<3;j++)rod(g,[ss*(.202+j*.034),3.13-j*.026,.02],[ss*(.225+j*.026),2.70-j*.079,.055],.054,.039,mat,6);
  }
  rod(g,[0,3.07,.223],[0,2.959,.26],.061,.048,mat,5);
  if(style%3===0){
    cyl(g,0,3.32,-.015,.25,.243,.087,'brass',12);
    const beard=cyl(g,0,2.777,.107,.061,.213,.348,mat,9);beard.rotation.x=-.21;
    for(let j=0;j<6;j++)rod(g,[(j-2.5)*.059,2.946,.228],[(j-2.5)*.030,2.648+.046*Math.abs(j-2.5),.192],.036,.014,mat,5);
    for(let j=0;j<6;j++){const a=j*TAU/6;cyl(g,.22*sin(a),3.42,-.015+.21*cos(a),.07,0,.21,'bronze',5);}
  }else{const hood=orb(g,0,2.94,-.088,.309,.38,.216,mat,9);hood.rotation.x=-.12;}
  if(role===1){
    const instrument=group(g,0,2.25,.46,.13);
    orb(instrument,0,0,0,.205,.205,.205,'bronze',12);
    for(let i=0;i<3;i++){const ring=torus(instrument,0,0,0,.306,.030,'brass',false,20);ring.rotation.set(.42*i,i*1.07,i*.39);}
  }else if(role===2){
    const book=group(g,0,2.19,.49);book.rotation.x=-.61;
    for(const side of [-1,1]){
      const page=group(book,side*.166,0,0,-side*.22);
      box(page,0,0,0,.332,.379,.069,'bone');
      for(let j=0;j<4;j++)box(page,0,.11-j*.064,.037,.216-j*.011,.014,.008,'trim');
    }
  }else if(role===4){
    const ewer=group(g,.27,1.67,.43);
    lineProfile(ewer,0,0,0,.218,.64,[[.51,0],[.58,.085],[.92,.22],[1.03,.45],[.81,.67],[.43,.77],[.42,.94],[.65,1]],'bronze',18);
    const grip=torus(ewer,.186,.42,.02,.121,.031,'brass',false,14);grip.scale.y*=1.49;
  }else{
    const staffTop=style===0?2.60:3.08;
    rod(g,[stance*.22,.42,.49],[stance*.19,staffTop,.51],.047,.039,style===0?'brass':mat,8);
    ico(g,stance*.19,staffTop+.10,.51,.083,.130,.081,style===0?'jewel':mat);
  }
  const belt=torus(g,0,1.946,.005,.377,.057,'bronze',true,14);belt.scale.y*=.72;
  tube(g,[[-.386,2.60,.13],[-.20,2.32,.31],[.06,2.20,.34],[.38,2.42,.18]],.055,mat,13,6);
  return g;
}
// A single continuous carving for the large niche. The fold lines run
// through successive sections of the robe and across the weight-bearing leg.
function guardian(p,x,y,z,height){
  const g=group(p,x,y,z);g.scale.setScalar(height/3.60);
  function skin(parent,columns,rows,point,material){
    const positions=[],indices=[];
    for(let j=0;j<=rows;j++)for(let i=0;i<=columns;i++){
      positions.push(...point(i/columns,j/rows));
      if(i<columns&&j<rows){
        const n=j*(columns+1)+i;
        indices.push(n,n+1,n+columns+1,n+1,n+columns+2,n+columns+1);
      }
    }
    return mesh(parent,rawGeo(positions,indices),material);
  }
  function section(profile,t){
    const v=clamp(t,0,1)*(profile.length-1),i=Math.min(profile.length-2,Math.floor(v)),f=v-i;
    return profile[i].map((a,k)=>mix(a,profile[i+1][k],f));
  }
  cyl(g,0,.112,0,.80,.78,.224,'aged',12);cyl(g,0,.256,0,.72,.67,.08,'trim',12);
  for(const s of [-1,1]){
    const foot=group(g,s*.216,.323,s<0?.140:-.061,s*.095);
    orb(foot,0,0,.083,.146,.078,.291,'statue',16);
    tube(foot,[[-.12,.039,.12],[-.041,.080,.18],[.10,.045,.23]],.022,'bronze',7,5);
  }
  const robe=[[.371,.604,.392,.015],[.426,.615,.406,.010],[.57,.592,.393,0],[.87,.543,.354,-.013],[1.16,.486,.328,.006],
    [1.42,.436,.303,.012],[1.67,.377,.275,.017],[1.91,.351,.257,.023],[2.08,.391,.273,.013],[2.32,.442,.304,.011],
    [2.49,.480,.287,-.014],[2.57,.418,.251,-.026],[2.67,.244,.206,-.012],[2.75,.156,.163,0]];
  skin(g,96,49,(u,v)=>{
    const a=u*TAU,[yy,rx,rz,zc]=section(robe,v);
    const folds=.060*(1.-.58*v)*(.72*cos(15*a+1.05*yy)+.28*cos(8*a-.79*yy));
    const knee=.088*Math.exp(-((yy-1.08)**2)/.18)*Math.exp(-((a-.48)**2)/.43);
    return [(rx+folds)*sin(a)-.036*v,(yy+.037*sin(a*4+.76)*(1-v)**6),zc+(rz+folds*.84)*cos(a)+knee];
  },'statue');
  // A heavier mantle, open in front, falls from the shoulders onto the plinth.
  skin(g,66,32,(u,v)=>{
    const a=.78+u*(TAU-1.58),r=mix(.656,.533,v)-.11*sin(PI*v);
    const fold=.055*sin(a*12.8+v*.93)+.020*sin(a*21-v*1.43);
    return [(r+fold)*sin(a)-.03*v,.397+2.19*v+.036*cos(a*5)*(1-v),
      (mix(.443,.318,v)+fold*.76)*cos(a)-.016];
  },'statue');
  for(let j=0;j<5;j++){
    const q=j/4,pts=[];
    for(let i=0;i<12;i++){
      const u=i/11,arc=sin(u*PI);
      pts.push([mix(-.462,.409,u),2.556+.037*u-(.16+q*.28)*arc,
        .110+.209*arc+q*.026]);
    }
    tube(g,pts,.038-.009*q,'statue',22,7);
  }
  for(const s of [-1,1]){
    const boss=group(g,s*.422,2.56,.13,s*.32);
    orb(boss,0,0,0,.081,.082,.036,'bronze',12);sunEmblem(boss,0,0,.035,.056,'brass',8);
  }
  const belt=torus(g,-.02,1.94,.02,.349,.041,'bronze',true,28);belt.scale.y*=.77;
  for(let i=0;i<12;i++){const a=i*TAU/12;orb(g,-.02+.35*sin(a),1.94,.02+.269*cos(a),.024,.020,.024,'brass',8);}
  // Sleeves follow the upper arm, elbow and wrist with a continuous section.
  function sleeve(path,radii){
    const curve=new T.CatmullRomCurve3(path.map(q=>V(...q))),n=26;
    const frames=curve.computeFrenetFrames(n,false),points=curve.getSpacedPoints(n);
    skin(g,18,n,(u,v)=>{
      const i=Math.min(n,Math.round(v*n)),s=v*(radii.length-1),k=Math.min(radii.length-2,Math.floor(s));
      const r=mix(radii[k],radii[k+1],s-k)*(.98+.048*cos(u*TAU*6+v*2.4));
      const a=u*TAU,pt=points[i].clone().addScaledVector(frames.normals[i],r*cos(a)).addScaledVector(frames.binormals[i],r*sin(a));
      return pt.toArray();
    },'statue');
  }
  sleeve([[-.43,2.48,.048],[-.528,2.24,.062],[-.493,2.004,.169],[-.221,1.974,.318],[.238,1.939,.463]],[.190,.176,.164,.134,.087]);
  sleeve([[.407,2.48,.057],[.51,2.29,.079],[.524,2.109,.170],[.468,2.107,.314],[.372,2.116,.476]],[.188,.173,.156,.129,.089]);
  const staffBase=[.209,.30,.54],staffEnd=[.607,3.07,.532];
  rod(g,staffBase,staffEnd,.052,.043,'brass',12);
  const shaftX=yy=>mix(staffBase[0],staffEnd[0],(yy-staffBase[1])/(staffEnd[1]-staffBase[1]));
  for(const [yy,side] of [[1.94,-1],[2.115,1]]){
    const xc=shaftX(yy);
    orb(g,xc+side*.067,yy,.478,.115,.082,.085,'statue',14);
    for(let j=0;j<4;j++){
      const fy=yy+.050-j*.036;
      tube(g,[[xc+side*.122,fy,.489],[xc+side*.077,fy+.011,.548],[xc+side*.030,fy+.002,.590],[xc-side*.026,fy-.015,.571]],.023,'statue',8,6);
    }
    tube(g,[[xc+side*.087,yy+.050,.478],[xc+side*.037,yy+.098,.501],[xc-side*.023,yy+.077,.547]],.031,'statue',8,7);
  }
  for(let i=0;i<6;i++){const yy=1.65+i*.048;torus(g,shaftX(yy),yy,.54,.055,.012,'walnut',true,12);}
  const staffHead=group(g,...staffEnd);
  lineProfile(staffHead,0,-.03,0,.113,.28,[[.40,0],[.73,.14],[.70,.23],[.37,.34],[.47,.53],[.97,.68],[1,.81],[.65,1]],'brass',12);
  ico(staffHead,0,.292,0,.083,.133,.083,'jewel',1);
  for(const side of [-1,1])tube(staffHead,[[side*.093,.16,0],[side*.132,.269,0],[side*.084,.352,0],[0,.422,0]],.016,'gold',11,5);
  cyl(g,-.032,2.725,-.015,.158,.153,.255,'statue',18);
  const head=group(g,-.036,3.012,.009,-.077);head.rotation.x=.072;
  const face=[[-.279,.051,.101,.094],[-.236,.137,.157,.066],[-.174,.190,.176,.041],[-.086,.221,.187,.029],
    [.002,.237,.197,.018],[.079,.239,.202,.012],[.149,.228,.202,.003],[.220,.218,.192,-.007],
    [.278,.183,.17,-.014],[.318,.132,.14,-.021],[.344,.05,.081,-.028]];
  skin(head,55,36,(u,v)=>{
    const a=u*TAU,[yy,rx,rz,zc]=section(face,v),xx=rx*sin(a),front=Math.max(0,cos(a));
    const sockets=.037*Math.exp(-((Math.abs(xx)-.092)**2)/.0024-((yy-.044)**2)/.0010);
    const cheek=.028*Math.exp(-((Math.abs(xx)-.138)**2)/.0034-((yy+.040)**2)/.0036);
    return [xx,yy,zc+rz*cos(a)+(cheek-sockets)*front**3];
  },'statue');
  for(const s of [-1,1]){
    orb(head,s*.231,-.019,-.006,.047,.085,.045,'statue',12);
    tube(head,[[s*.031,.099,.212],[s*.077,.110,.211],[s*.128,.101,.188],[s*.167,.078,.166]],.026,'statue',9,7);
    tube(head,[[s*.036,.046,.200],[s*.083,.057,.205],[s*.124,.051,.191],[s*.148,.038,.177]],.012,'statue',8,5);
    orb(head,s*.093,.034,.194,.056,.012,.015,'aged',10);
    tube(head,[[s*.031,-.099,.224],[s*.070,-.093,.226],[s*.105,-.116,.207],[s*.137,-.135,.182]],.019,'statue',9,5);
    for(let j=0;j<4;j++){
      const w=.209+j*.012;
      tube(head,[[s*w,.151-j*.021,.029-j*.035],[s*(w+.024),.010,.056-j*.037],
        [s*(w+.014),-.186-j*.016,.026-j*.037],[s*(w+.061),-.299-j*.018,-.02-j*.020]],.040-j*.004,'statue',13,7);
    }
  }
  skin(head,14,11,(u,v)=>{
    const a=u*TAU,[yy,r,zz]=section([[-.085,.046,.225],[-.062,.061,.247],[-.030,.052,.244],[.032,.032,.228],[.108,.024,.199]],v);
    return [r*sin(a),yy,zz+r*.70*cos(a)];
  },'statue');
  for(let j=-4;j<=4;j++){
    const xx=j*.037,yy=-.137-.058*Math.abs(j/4),len=.193-.050*Math.abs(j/4);
    tube(head,[[xx,yy,.211-.056*Math.abs(j/4)],[xx*.98+.007,yy-len*.43,.214],[xx*.64,yy-len,.167-.033*Math.abs(j/4)]],
      .031-.005*Math.abs(j/4),'statue',10,6);
  }
  cyl(head,0,.188,-.002,.236,.232,.060,'bronze',24);
  for(let j=0;j<9;j++){
    const a=j*TAU/9,prong=group(head,.222*sin(a),.208,.222*cos(a),a);
    extrude(prong,[[-.058,0],[0,.121+(j%3===0?.055:0)],[.058,0]],.028,'brass');
  }
  return g;
}
function oldChain(p,x,y,z,length,slant=1) {
  const g=group(p,x,y,z);
  torus(g,0,.70,0,1.08,.235,'iron',false,20);
  const n=Math.ceil(length/1.27);
  for(let i=0;i<n;i++){
    const v=i/(n-1),xx=slant*(v*2.9+sin(v*PI)*.65),zz=v*2;
    const r=torus(g,xx,-i*1.25,zz,.55,.13,'iron',false,14);
    r.scale.y*=1.60;r.rotation.y=i*PI/2+v*.42+.28;r.rotation.z=.08*slant;
  }
  for(let i=0;i<4;i++){
    const rr=rand(.39,.62),off=i*1.4,path=[];
    for(let j=0;j<18;j++){const t=j/17;path.push([cos(t*14+off)*rr+slant*t*.6,1.5-t*(7+i),sin(t*14+off)*rr+t*.5]);}
    tube(g,path,.09-i*.012,'bark',29,6);
  }
}
