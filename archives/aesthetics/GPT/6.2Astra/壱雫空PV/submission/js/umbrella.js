"use strict";

// The vinyl, ribs and water share the same deforming eight-gore surface.
// Coordinates are in units of the open canopy radius, with +Y up.
const parasol = (() => {
  const gores = 8, crown = .64, arcAngle = 1.17, rows = 8, columns = 6;
  const sinArc = Math.sin(arcAngle), cosArc = Math.cos(arcAngle);
  const refractionSurfaces = new Map();
  let openMesh;

  function skin(u, k, opening) {
    const v = frac(k), a = k * TAU / gores, pleat = Math.sin(PI * v);
    const length = Math.sin(arcAngle * u) / sinArc * (1 - .061 * pleat * u);
    const height = crown * (Math.cos(arcAngle * u) - cosArc) / (1 - cosArc)
      + .106 * pleat * u * u;
    const spread = (.055 + .945 * opening) * (1 - .50 * (1 - opening) * pleat);
    const r = length * spread;
    const y = opening === 1 ? height :
      crown - Math.sqrt(Math.max(0, (crown - height) ** 2 + length * length - r * r));
    return [r * Math.cos(a), y, r * Math.sin(a)];
  }
  function normal(u, k, open) {
    const a = skin(u, k, open), b = skin(u + .001, k, open), c = skin(u, k + .001, open);
    const ax = b[0]-a[0], ay = b[1]-a[1], az = b[2]-a[2];
    const bx = c[0]-a[0], by = c[1]-a[1], bz = c[2]-a[2];
    const x = by*az-bz*ay, y = bz*ax-bx*az, z = bx*ay-by*ax;
    const length = Math.hypot(x, y, z) || 1;
    return [x/length, y/length, z/length];
  }
  function geometry(open) {
    if (open === 1 && openMesh) return openMesh;
    const panels = [];
    for (let k = 0; k < gores; k++) {
      const grid = [];
      for (let i = 0; i <= rows; i++) {
        const row = [];
        for (let j = 0; j <= columns; j++) row.push(skin(i/rows, k+j/columns, open));
        grid.push(row);
      }
      const strips=[];
      for(let row=0;row<rows;row+=2){
        for(let col=0;col<columns;col+=3){
          const v=k+(col+1.5)/columns;
          strips.push({row,col,near:normal(Math.max(.012,row/rows),v,open),far:normal((row+2)/rows,v,open)});
        }
      }
      panels.push({grid, strips, normal:normal(.67,k+.5,open), k});
    }
    if (open === 1) openMesh = panels;
    return panels;
  }
  function lens(o) {
    const cy = Math.cos(o.yaw), sy = Math.sin(o.yaw);
    const ce = Math.cos(o.elevation), se = Math.sin(o.elevation);
    const cr = Math.cos(o.roll), sr = Math.sin(o.roll);
    function direction(p) {
      const right = cy*p[0]+sy*p[2], z = -sy*p[0]+cy*p[2];
      const up = ce*p[1]-se*z;
      return [right*cr+up*sr, right*sr-up*cr, se*p[1]+ce*z];
    }
    function project(p) {
      const v = direction(p), scale = o.r * 5.6/(5.6-v[2]);
      return [o.x+v[0]*scale, o.y+v[1]*scale, v[2], scale/o.r];
    }
    return {project, direction};
  }
  function make(options) {
    const o = {opening:1, night:false, water:"dry", seconds:0, seed:1, tint:BLUE, ...options};
    const camera = lens(o);
    const panels = geometry(o.opening).map(panel => {
      const grid = panel.grid.map(row => row.map(camera.project));
      const left = grid.map(row=>row[0]), right = grid.map(row=>row[columns]);
      const hem = grid[rows];
      const edge = [...left,...hem.slice(1),...right.slice(0,-1).reverse()];
      const n = camera.direction(panel.normal);
      const light = clamp(.40-.42*n[0]-.52*n[1]+.22*n[2]);
      const facets=panel.strips.map(({row:i,col:j,near,far})=>{
        const points=[...grid[i].slice(j,j+4),grid[i+1][j+3],
          ...grid[i+2].slice(j,j+4).reverse(),grid[i+1][j]];
        const depth=grid[i+1][j+1][2];
        return {points,near:camera.direction(near),far:camera.direction(far),
          a:grid[i][j+1],b:grid[i+2][j+1],depth};
      });
      return {k:panel.k, grid, edge, hem, n, light, facets, depth:grid[5][3][2]};
    });
    return {o, ...camera, panels, point:(u,k)=>camera.project(skin(u,k,o.opening))};
  }
  function foregroundSkyline(model) {
    const points = model.panels.flatMap(p=>p.grid.flat()).sort((a,b)=>a[0]-b[0] || a[1]-b[1]);
    const hull = [];
    for (const p of points) {
      while (hull.length >= 2) {
        const a = hull[hull.length-2], b = hull[hull.length-1];
        if ((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]) > .01) break;
        hull.pop();
      }
      hull.push(p);
    }
    const length = [0];
    for (let i=1;i<hull.length;i++)
      length.push(length[i-1]+Math.hypot(hull[i][0]-hull[i-1][0],hull[i][1]-hull[i-1][1]));
    return t => {
      const at = clamp(t)*length[length.length-1];
      let i=1;
      while(i<length.length-1 && length[i]<at) i++;
      const a=hull[i-1], b=hull[i], f=(at-length[i-1])/(length[i]-length[i-1] || 1);
      return [mix(a[0],b[0],f),mix(a[1],b[1],f),Math.atan2(b[1]-a[1],b[0]-a[0])];
    };
  }

  // Copy the printed page underneath the model. The clip is the projected
  // curved gore, and its optical transform depends on its view-space normal.
  // drawImage works on local-file canvases without reading back image pixels.
  function transmit(model) {
    const {o,panels}=model, m=g.getTransform(), inv=m.inverse();
    let xmin=Infinity, xmax=-Infinity, ymin=Infinity, ymax=-Infinity;
    for(const panel of panels) for(const row of panel.grid) for(const p of row) {
      const x=m.a*p[0]+m.c*p[1]+m.e, y=m.b*p[0]+m.d*p[1]+m.f;
      xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);
    }
    const gutter=3+Math.ceil(.085*o.r*Math.max(Math.hypot(m.a,m.b),Math.hypot(m.c,m.d)));
    const x0=Math.max(0,Math.floor(xmin)-gutter), y0=Math.max(0,Math.floor(ymin)-gutter);
    const w=Math.min(g.canvas.width,Math.ceil(xmax)+gutter)-x0;
    const h=Math.min(g.canvas.height,Math.ceil(ymax)+gutter)-y0;
    if(w<=0 || h<=0)return;
    // A given crop always has the same texture dimensions, including on a
    // direct 4K seek. This keeps normalized GPU sampling coordinates stable.
    const width=2**Math.ceil(Math.log2(w)),height=2**Math.ceil(Math.log2(h));
    const key=width+"x"+height;
    let scratch=refractionSurfaces.get(key);
    if(!scratch){
      if(refractionSurfaces.size>=6)refractionSurfaces.delete(refractionSurfaces.keys().next().value);
      scratch=surface(width,height);refractionSurfaces.set(key,scratch);
    }
    const glass=scratch.getContext("2d");
    glass.clearRect(0,0,w,h);
    glass.drawImage(g.canvas,x0,y0,w,h,0,0,w,h);
    const panes=panels.slice().sort((a,b)=>a.depth-b.depth);
    for(const pane of panes) {
      const n=pane.n, mid=pane.grid[5][3], grazing=1-Math.abs(n[2]);
      const dx=-n[0]*o.r*.020, dy=-n[1]*o.r*.024;
      g.save();g.beginPath();
      for(const f of pane.facets){
        // Keep winding consistent even where the curved pane turns away.
        const pts=f.points, a=pts[0], b=pts[3], c=pts[5];
        let area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
        if(Math.abs(area)<.001)area=(pts[6][0]-pts[4][0])*(a[1]-pts[4][1])-(pts[6][1]-pts[4][1])*(a[0]-pts[4][0]);
        g.moveTo(a[0],a[1]);
        for(let i=1;i<pts.length;i++){const q=pts[area>=0?i:pts.length-i];g.lineTo(q[0],q[1])}
        g.closePath();
      }
      g.clip();
      g.translate(mid[0]+dx,mid[1]+dy);
      g.transform(1.011+.020*grazing,n[1]*.022,n[0]*.027,1.015+.023*grazing,0,0);
      g.translate(-mid[0],-mid[1]);
      g.transform(inv.a,inv.b,inv.c,inv.d,inv.e,inv.f);
      g.drawImage(scratch,0,0,w,h,x0,y0,w,h);g.restore();
    }
  }
  function linework(pts,color,width) {path(pts,null,color,width,false)}
  function filmColor(o,n){
    const facing=Math.abs(n[2]), fresnel=(1-facing)**2;
    const rx=2*n[2]*n[0], ry=2*n[2]*n[1], rz=2*n[2]*n[2]-1;
    // A broad sky reflection and a narrow strip of light, both reflected
    // about the actual normal of this piece of the curved membrane.
    const sky=clamp(.46-.50*rx-.24*ry+.08*rz);
    const window=Math.exp(-((rx+.53+ry*.17)**2)/.016-((ry+.38)**2)/.62);
    const sunny=o.water==="sun";
    const base=blend(o.tint,o.night?"#9bafbe":"#527b92",.09+.13*(1-sky));
    const color=blend(base,sunny?"#fff7d7":WHITE,.06+.20*sky+.58*window);
    const alpha=(o.night?.33:sunny?.39:.16)+.18*fresnel+.14*window;
    return rgba(color,alpha);
  }
  function membrane(o,f){
    const grad=g.createLinearGradient(f.a[0],f.a[1],f.b[0],f.b[1]);
    grad.addColorStop(0,filmColor(o,f.near));grad.addColorStop(1,filmColor(o,f.far));
    path(f.points,grad);
  }
  function panelInk(model,p) {
    const {o}=model, night=o.night, large=o.r>180;
    const root=p.grid[0][0], outer=p.hem[3], tint=o.tint;
    // Long, tapering window reflections on vinyl. Their width and strength
    // follow the normal. The secondary line is the pressed fold in the gore.
    const strength=clamp((p.light-.32)/.65);
    const shine=(v0,v1,u0,u1,bow) => {
      const l=[],r=[];
      for(let j=0;j<=7;j++){
        const t=j/7,u=mix(u0,u1,t),v=mix(v0,v1,t)+bow*Math.sin(t*PI);
        const width=(.012+.18*strength)*(.05+.95*Math.sin(PI*t)**.72);
        l.push(model.point(u,p.k+v-width));r.push(model.point(u,p.k+v+width));
      }
      return [...l,...r.reverse()];
    };
    const spec=g.createLinearGradient(root[0],root[1],outer[0],outer[1]);
    spec.addColorStop(0,rgba(WHITE,.02));spec.addColorStop(.48,rgba(WHITE,.18+.55*strength));
    spec.addColorStop(.80,rgba(WHITE,.07+.27*strength));spec.addColorStop(1,rgba(WHITE,0));
    if(strength>.045)path(shine(.60,.22,.13,.98,.075),spec);
    if(strength>.36)path(shine(.76,.62,.32,.90,.045),rgba(WHITE,.06+.21*strength));
    const fold=p.grid.slice(2).map(row=>row[3]);
    linework(fold,rgba(night?WHITE:DEEP,night?.26:.18),Math.max(.57,o.r*.0031));
    const crease=p.grid.slice(3).map(row=>[row[3][0]-.52,row[3][1]-.45]);
    linework(crease,rgba(WHITE,.43+.22*strength),Math.max(.55,o.r*.0025));
    if(large && strength>.30){
      const small=f=>Array.from({length:8},(_,i)=>model.point(.33+i*.072,p.k+f-.12*i/7+.018*Math.sin(i*.8)));
      linework(small(.19),rgba(WHITE,.35*strength),1.4);
      linework(small(.20),rgba(WHITE,.23*strength),.75);
    }
    linework(p.hem,rgba(night?blend(tint,WHITE,.55):"#375e72",night?.94:.68),Math.max(1.4,o.r*.011));
    linework(p.hem,rgba(WHITE,.78),Math.max(.62,o.r*.0048));
  }
  function ribwork(model,queue) {
    const {o,project,point}=model, r=o.r, open=o.opening;
    function tube(pts,wide,outer,inner,shine) {
      const z=pts.reduce((s,p)=>s+p[2],0)/pts.length;
      const w=wide*pts[Math.floor(pts.length/2)][3];
      queue.push([z,()=>{
        linework(pts,outer,w);
        linework(pts,inner,w*.62);
        if(shine && w>1.55)
          linework(pts.map(p=>[p[0]-w*.15,p[1]-w*.10]),shine,w*.20);
      }]);
    }
    function fitting(a,b,width,ink,silver) {
      tube([project(a),project(b)],width,ink,silver,WHITE);
    }
    const outer=o.night?"#324657":"#405361", steel="#b7cbd1";
    const runner=mix(-.47,.055,open);
    fitting([0,-.73,0],[0,.645,0],Math.max(2.3,r*.019),outer,"#adbdc1");
    // The crook is bent in a vertical plane fixed to the shaft.
    const hookAngle=.87, hx=Math.cos(hookAngle),hz=Math.sin(hookAngle), hook=[];
    hook.push(project([0,-.69,0]),project([0,-.84,0]));
    for(let j=0;j<=14;j++){
      const a=j*PI/14,rad=.100*(1-Math.cos(a));
      hook.push(project([hx*rad,-.84-.10*Math.sin(a),hz*rad]));
    }
    hook.push(project([hx*.20,-.79,hz*.20]));
    tube(hook,Math.max(3.6,r*.041),outer,"#dbe8e6",WHITE);
    fitting([0,-.745,0],[0,-.70,0],Math.max(2.5,r*.034),"#465965",steel);
    for(let k=0;k<gores;k++){
      const rib=model.panels[k].grid.map(row=>row[0]);
      // Splitting the curved rod at its knee lets front and rear struts
      // pass correctly behind the nearer sheet of vinyl.
      tube(rib.slice(0,5),Math.max(1.25,r*.0090),outer,steel,WHITE);
      tube(rib.slice(4),Math.max(1.1,r*.0079),outer,steel,WHITE);
      const joint=skin(.60,k,open), a=k*TAU/gores;
      const pin=[Math.cos(a)*.017,runner,Math.sin(a)*.017];
      const shoulder=[joint[0]*.39,mix(runner,joint[1],.39)-.032,joint[2]*.39];
      tube([project(pin),project(shoulder),project(joint)],Math.max(1.0,r*.0064),outer,"#c9d6d6",null);
      const tip=point(1,k), before=point(.974,k);
      tube([before,tip],Math.max(2.3,r*.016),outer,blend(o.tint,WHITE,.52),WHITE);
      if(r>160){
        const pivot=project(joint);
        queue.push([pivot[2]+.004,()=>circ(pivot[0],pivot[1],r*.0069,steel,outer,.8)]);
      }
    }
    fitting([0,runner-.048,0],[0,runner+.035,0],Math.max(3.5,r*.055),outer,steel);
    fitting([0,crown-.048,0],[0,crown+.025,0],Math.max(3.1,r*.058),outer,steel);
    fitting([0,crown+.018,0],[0,crown+.112,0],Math.max(2.0,r*.026),outer,"#d1dbda");
    const top=project([0,crown+.11,0]);
    queue.push([top[2]+.006,()=>ellipse(top[0],top[1],Math.max(.75,r*.011),Math.max(.62,r*.0075),WHITE,outer,.65)]);
  }

  const drops=new Map();
  function beadSprite(style) {
    if(drops.has(style))return drops.get(style);
    const tile=surface(96,104), c=tile.getContext("2d");
    const body=c.createRadialGradient(38,31,2,48,52,39);
    const sun=style==="sun";
    body.addColorStop(0,sun?"rgba(255,243,182,.85)":"rgba(245,255,255,.50)");
    body.addColorStop(.39,"rgba(186,230,240,.12)");
    body.addColorStop(.67,sun?"rgba(239,196,99,.56)":"rgba(137,190,208,.30)");
    body.addColorStop(.88,sun?"rgba(175,136,72,.73)":"rgba(32,74,99,.71)");
    body.addColorStop(1,"rgba(206,245,255,.84)");
    const oval=(x,y,rx,ry,a,color)=>{
      c.beginPath();c.ellipse(x,y,rx,ry,a,0,TAU);c.fillStyle=color;c.fill();
    };
    oval(49,54,36,39,0,"rgba(22,57,75,.24)");
    oval(47,50,35,39,0,body);
    c.beginPath();c.ellipse(47,50,30,34,0,.08*PI,.63*PI);
    c.strokeStyle=style==="sun"?"#ffefae":"rgba(225,255,255,.91)";c.lineWidth=3;c.stroke();
    oval(35,34,10.7,5.2,-.58,style==="sun"?"#fff9d3":"#ffffff");
    oval(49,27,3.1,2.7,0,"rgba(255,255,255,.92)");
    drops.set(style,tile);return tile;
  }
  function water(model,queue) {
    const {o,point}=model, r=o.r;
    if(o.water==="dry")return;
    const sunny=o.water==="sun", big=r>180, seed=o.seed*197;
    const sprite=beadSprite(sunny?"sun":"rain");
    const tremble=o.tremble||0;
    function bead(p,size,stretch=1,angle=0,spark=false){
      const s=size*p[3], w=2.68*s,h=2.65*s*stretch;
      queue.push([p[2]+.012,()=>{
        place(p[0],p[1],()=>{
          g.drawImage(sprite,-w*.5,-h*.5,w,h);
          if(spark){
            const a=.9+.12*Math.sin(o.seconds*4.2+size);
            const gx=-s*.35,gy=-s*.4,L=s*(1.58+.47*a);
            path([[gx-L,gy],[gx-.18*s,gy-.16*s],[gx,gy-L],[gx+.16*s,gy-.16*s],
              [gx+L,gy],[gx+.16*s,gy+.16*s],[gx,gy+L],[gx-.16*s,gy+.16*s]],"#fff4bc");
            circ(gx,gy,s*.34,WHITE);
          }
        },angle);
      }]);
    }
    const count=sunny?(o.seed%2?1:2):big?55:14;
    for(let i=0;i<count;i++){
      const n=seed+i*9.73, area=.17+.79*Math.sqrt(rnd(n+13));
      const k=gores*rnd(n+.6)+tremble*.052*Math.sin(n+o.seconds*34);
      const sz=sunny?(i===0?4.1:2.85):(big?1.55:1.1)+(big?5.65:2.14)*rnd(n+5)**1.75;
      const u=area+.011*tremble*Math.cos(n+o.seconds*37);
      bead(point(u,k),sz,sunny?1:1.04+.11*rnd(n+1),.24*Math.sin(k),sunny && i===0);
      if(big && i%5===0)bead(point(u+.013,k+.037),sz*.36);
    }
    if(sunny)return;
    if(o.landingAge!=null && o.landingAge<.48){
      for(let j=0;j<2;j++){
        const t=o.landingAge-.025-j*.052;
        if(t<-.12||t>.39)continue;
        const pose=t<0?o:o.releasePose(t),cam=lens(pose);
        const ends=Array.from({length:gores},(_,k)=>cam.project(skin(1,k,1))).sort((a,b)=>a[0]-b[0]);
        const p=ends[j], dt=Math.max(0,t);
        bead([p[0]-r*(1.65-j*.4)*dt,p[1]+r*(-.35*dt+2.6*dt*dt),p[2]+.17,p[3]],
          (3.15-j*.73)*(1-.48*span(t,.21,.39)),1.28,-.30);
      }
    }
    const countFlows=big?4:2;
    for(let i=0;i<countFlows;i++){
      const n=seed+113*i, period=(big?1.65:1.17)+.32*rnd(n+40);
      const phase=frac(o.seconds/period+.16+i*.271+o.seed*.039);
      const seam=mod((big?1:o.seed)+i*(big?2:3),gores), sign=i%2?-1:1;
      const start=.38+.14*rnd(n+8), size=big?4.3+2.1*rnd(n+9):2.25+.95*rnd(n+9);
      const slide=smooth(span(phase,.26,.69)), merge=smooth(phase/.26);
      const u=mix(start,1,slide), k=seam+sign*.19*(1-slide);
      if(phase<.26){
        bead(point(start-.067*(1-merge),k+sign*.090*(1-merge)),size*.54*(1-.55*merge));
      }
      if(phase<.78){
        const p=point(u,k), tail=point(Math.max(start,u-.072*Math.sin(slide*PI)),k+.008*sign);
        if(slide>0 && slide<1)
          queue.push([p[2]+.009,()=>linework([tail,p],rgba(WHITE,.60),size*.42)]);
        const pendant=span(phase,.69,.78);
        bead(p,size*(.77+.23*merge),1+.35*Math.sin(slide*PI)+.48*pendant);
      }else{
        const t=(phase-.78)*period, rim=point(1,seam);
        const v=Math.sign(rim[0]-o.x);
        // Detached drops inherit the rim position at release, then fall in
        // page space while the umbrella can keep moving past them.
        const release=o.releasePose?makeRim(o.releasePose(t),seam):rim;
        const p=[release[0]+v*r*t*(o.night?.65:.10),release[1]+r*(.13*t+2.4*t*t),release[2]+.18,release[3]];
        bead(p,size*(1-.40*span(phase,.86,1)),1.48-.25*span(phase,.78,1),-v*.08);
      }
    }
  }
  function makeRim(pose,seam){return lens(pose).project(skin(1,seam,1))}
  function draw(model) {
    transmit(model);
    const queue=[];
    g.save();g.lineJoin="round";g.lineCap="round";
    for(const p of model.panels){
      for(const f of p.facets)queue.push([f.depth,()=>membrane(model.o,f)]);
      queue.push([p.depth+.009,()=>panelInk(model,p)]);
    }
    ribwork(model,queue);water(model,queue);
    queue.sort((a,b)=>a[0]-b[0]);
    for(const [,paintItem] of queue)paintItem();
    g.restore();
    return model;
  }
  return {make, draw, skyline:foregroundSkyline};
})();

