(function () {
  'use strict';

  const C = {
    sky: 0xd9f1ef, skyTop: 0x93cdd3, cloud: 0xf7fbf5,
    concrete: 0xc7cbc3, concreteDark: 0x7d9994, edge: 0x315f65,
    water: 0x48b7b0, waterLight: 0x8ddad1, waterDark: 0x176e78,
    deep: 0x164f5b, white: 0xf5f2e8, ink: 0x244f55,
    yellow: 0xf3bf45, orange: 0xe67b42, red: 0xd94e43,
    green: 0x4f946c, green2: 0x82ae71, wood: 0x9b7654, rust: 0xa95e42,
    gold: 0xffd98a, glass: 0xa9e1dc, black: 0x263b3b
  };

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(C.sky, 0.0125);

  const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 150);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(0xe7ffff, 0x47787a, 2.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1bd, 3.25);
  sun.position.set(18, 32, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -27; sun.shadow.camera.right = 27;
  sun.shadow.camera.top = 27; sun.shadow.camera.bottom = -27;
  sun.shadow.camera.near = 2; sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0003;
  scene.add(sun);
  const warmFill = new THREE.PointLight(0xffd17b, 12, 28, 2);
  warmFill.position.set(-7, 9, 9);
  scene.add(warmFill);

  const mats = {};
  function toon(color, opts) {
    opts = opts || {};
    const key = color + ':' + (opts.roughness || 0) + ':' + (opts.transparent || false) + ':' + (opts.opacity || 1) + ':' + (opts.side || 0);
    if (!opts.unique && mats[key]) return mats[key];
    const m = new THREE.MeshToonMaterial({
      color, transparent: !!opts.transparent, opacity: opts.opacity === undefined ? 1 : opts.opacity,
      side: opts.side || THREE.FrontSide, depthWrite: opts.depthWrite === undefined ? true : opts.depthWrite
    });
    if (opts.emissive !== undefined) { m.emissive = new THREE.Color(opts.emissive); m.emissiveIntensity = opts.emissiveIntensity || 1; }
    if (!opts.unique) mats[key] = m;
    return m;
  }
  function basic(color, opacity) {
    return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: opacity > .7 });
  }
  function shadowify(mesh) { mesh.castShadow = true; mesh.receiveShadow = true; return mesh; }
  function outline(mesh, color, opacity) {
    if (!mesh.geometry) return mesh;
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 28), new THREE.LineBasicMaterial({ color: color || C.edge, transparent: opacity < 1, opacity: opacity === undefined ? .65 : opacity }));
    e.renderOrder = 3; mesh.add(e); return mesh;
  }
  function box(parent, name, size, pos, color, edge, material) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material || toon(color));
    m.name = name || ''; m.position.set(pos[0], pos[1], pos[2]); shadowify(m); parent.add(m);
    if (edge !== false) outline(m, typeof edge === 'number' ? edge : C.edge, .42);
    return m;
  }
  function cyl(parent, name, radius, height, pos, color, segments, rotation, material) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments || 12), material || toon(color));
    m.name = name || ''; m.position.set(pos[0], pos[1], pos[2]);
    if (rotation) m.rotation.set(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0);
    shadowify(m); parent.add(m); outline(m, C.edge, .34); return m;
  }
  function sphere(parent, radius, pos, color, scale, material) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 2), material || toon(color));
    m.position.set(pos[0], pos[1], pos[2]); if (scale) m.scale.set(scale[0], scale[1], scale[2]); shadowify(m); parent.add(m); return m;
  }
  function torus(parent, major, tube, pos, color, rotation, arc) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(major, tube, 7, 18, arc || Math.PI * 2), toon(color));
    m.position.set(pos[0], pos[1], pos[2]); if (rotation) m.rotation.set(rotation[0], rotation[1], rotation[2]); shadowify(m); parent.add(m); return m;
  }
  function line(parent, points, color, opacity, width) {
    const g = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(p[0], p[1], p[2])));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity: opacity === undefined ? 1 : opacity, linewidth: width || 1 }));
    parent.add(l); return l;
  }
  function canvasTexture(lines, bg, fg, w, h) {
    const can = document.createElement('canvas'); can.width = w || 512; can.height = h || 256;
    const x = can.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, can.width, can.height);
    x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    lines.forEach((s, i) => { x.font = `${s.size || 42}px "Microsoft YaHei",sans-serif`; x.fillText(s.text, can.width / 2, (i + 1) * can.height / (lines.length + 1)); });
    const t = new THREE.CanvasTexture(can); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  const ropeMats = {};
  function ropeMaterial(color) {
    if (ropeMats[color]) return ropeMats[color];
    const base = new THREE.Color(color), dark = base.clone().multiplyScalar(.62), light = base.clone().lerp(new THREE.Color(0xffd9ad), .32);
    const can = document.createElement('canvas'); can.width = can.height = 96;
    const x = can.getContext('2d'); x.fillStyle = `#${base.getHexString()}`; x.fillRect(0, 0, 96, 96);
    x.lineCap = 'round';
    for (let i = -96; i < 192; i += 18) {
      x.strokeStyle = `#${dark.getHexString()}`; x.lineWidth = 5; x.beginPath(); x.moveTo(i, 98); x.lineTo(i + 96, -2); x.stroke();
      x.strokeStyle = `#${light.getHexString()}`; x.lineWidth = 2; x.beginPath(); x.moveTo(i + 5, 98); x.lineTo(i + 101, -2); x.stroke();
    }
    const tex = new THREE.CanvasTexture(can); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 3); tex.anisotropy = 4;
    ropeMats[color] = new THREE.MeshToonMaterial({ color: 0xffffff, map: tex }); return ropeMats[color];
  }

  // Watercolor sky dome and thin cloud banks.
  const skyGeo = new THREE.SphereGeometry(85, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(C.skyTop) }, bottom: { value: new THREE.Color(0xeaf8f2) } },
    vertexShader: 'varying vec3 vP; void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 top;uniform vec3 bottom;varying vec3 vP;void main(){float h=clamp(vP.y/55.0+.18,0.,1.);vec3 c=mix(bottom,top,smoothstep(0.,1.,h));gl_FragColor=vec4(c,1.);}'
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  const clouds = new THREE.Group(); scene.add(clouds);
  [[-24,18,-35,10,2.0],[10,21,-42,13,1.7],[34,16,-28,9,1.5],[-38,22,-12,12,1.8]].forEach((d,i)=>{
    const g=new THREE.Group(); g.position.set(d[0],d[1],d[2]);
    for(let k=0;k<5;k++) sphere(g,d[3]*(.28+((k*7)%3)*.06),[(k-2)*d[3]*.26,Math.sin(k)*.35,0],C.cloud,[1.5,.35,.6],toon(C.cloud,{transparent:true,opacity:.72,depthWrite:false}));
    g.userData.speed=.06+i*.013;g.userData.baseX=d[0]; clouds.add(g);
  });
  const sunVisual=new THREE.Group();sunVisual.position.set(-12,6,-34);scene.add(sunVisual);
  const sunHaloMat=basic(0xffd98a,.08),sunCoreMat=basic(0xffefb7,.44);
  const sunHalo=new THREE.Mesh(new THREE.CircleGeometry(4.8,48),sunHaloMat),sunCore=new THREE.Mesh(new THREE.CircleGeometry(2.45,48),sunCoreMat);sunHalo.renderOrder=-1;sunCore.renderOrder=-1;sunVisual.add(sunHalo,sunCore);

  const world = new THREE.Group(); world.position.y = 0; scene.add(world);
  const staticWorld = new THREE.Group(); world.add(staticWorld);
  const animated = { boats: [], buoys: [], flags: [], seaweed: [], fish: [], gulls: [], drips: [], foam: [], wakeSlaps: [], trees: [], ripples: [], reflections: [], puddleReflections: [], puddleBirds: [], moorings: [], fenders: [], lightBeams: [], caustics: [], mist: [], hangingRopes: [], wetGlints: [] };

  // Collectible square plinth.
  box(staticWorld, '深青底座', [32, 1.45, 32], [0, -2.35, 0], 0x426f70, true);
  box(staticWorld, '底座下沿', [32.7, .42, 32.7], [0, -3.02, 0], 0x274f55, true);
  box(staticWorld, '前侧铭牌', [8.2, 1.15, .18], [-5, -2.22, 16.12], 0xe3dfca, true);
  const plaqueTex = canvasTexture([{text:'太阳雨の漁港',size:48},{text:'SUNSHOWER HARBOR',size:23}], '#ded8bd', '#315e60');
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(7.5,.85), new THREE.MeshBasicMaterial({map:plaqueTex}));
  plaque.position.set(-5,-2.18,16.22); staticWorld.add(plaque);

  // L-shaped concrete dock: broad foreground apron and long quay arm.
  box(staticWorld, '前景码头', [32, 2.7, 9], [0, -.25, 11.5], C.concrete, true);
  box(staticWorld, '纵向码头', [12, 2.7, 23], [-10, -.25, -4.5], C.concrete, true);
  // Wet top patches and expansion joints.
  const wet = toon(0xa9beb8,{transparent:true,opacity:.58,depthWrite:false,unique:true});
  [[-11,1.12,10,7,5],[-1,1.12,13,7,2.3],[9,1.12,9.4,6,3.8],[-11,1.12,0,8,3.2],[-9,1.12,-10,5,4]].forEach(p=>box(staticWorld,'湿润水迹',[p[3],.025,p[4]],[p[0],p[1],p[2]],0,false,wet));
  [[-12.8,10.2,.62,-.2],[-9.4,14.3,.82,.1],[-5.5,9.1,.48,.25],[-1.2,12.9,.72,-.15],[3.5,10.3,.55,.32],[7.8,14.2,.86,-.25],[12.4,9,.48,.1],[-12.6,4.7,.52,0],[-8.8,2.1,.7,.18],[-12,-4.5,.6,-.2],[-7.2,-8.8,.5,.1]].forEach((p,i)=>{
    const m=new THREE.Mesh(new THREE.PlaneGeometry(p[2],.045),basic(i%3===0?C.gold:0xe8f3e8,.06));m.rotation.set(-Math.PI/2,p[3],0);m.position.set(p[0],1.166,p[1]);m.renderOrder=4;m.material.depthTest=false;m.userData.phase=i*.73;staticWorld.add(m);animated.wetGlints.push(m);
  });
  for(let x=-15;x<=15;x+=4) box(staticWorld,'伸缩缝',[.045,.03,8.8],[x,1.125,11.5],C.concreteDark,false,basic(0x668b88,.42));
  for(let z=-14;z<=6;z+=4) box(staticWorld,'伸缩缝',[11.8,.03,.045],[-10,1.125,z],C.concreteDark,false,basic(0x668b88,.4));

  // A posterized cloud shadow is clipped to the two slabs that form the L-shaped quay.
  const cloudShadowUniforms={time:{value:0},strength:{value:0}};
  const cloudShadowMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:cloudShadowUniforms,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform float time;uniform float strength;varying vec2 vUv;void main(){float q=fract(vUv.x*.72+vUv.y*.34+time*.018);float band=smoothstep(.08,.24,q)*(1.-smoothstep(.56,.74,q));float cut=floor(band*3.)/3.;gl_FragColor=vec4(.10,.30,.32,cut*.075*strength);}'
  });
  function cloudShadow(size,pos){const m=new THREE.Mesh(new THREE.PlaneGeometry(size[0],size[1]),cloudShadowMat);m.rotation.x=-Math.PI/2;m.position.set(pos[0],1.152,pos[1]);m.renderOrder=2;staticWorld.add(m);}
  cloudShadow([32,9],[0,11.5]);cloudShadow([12,23],[-10,-4.5]);

  // Quay walls, block courses and tide marks.
  const wall = box(staticWorld,'码头岸壁',[.48,2.5,23],[-3.77,-.32,-4.5],0x8caaa5,true);
  for(let z=-15;z<7;z+=2.05) box(staticWorld,'岸壁砌块缝',[.04,.055,1.86],[-3.49,-.35,z+1],0x466f70,false,basic(0x426e70,.55));
  for(let y=-1.25;y<.75;y+=.62) box(staticWorld,'岸壁层线',[.04,.035,22.6],[-3.48,y,-4.5],0x456f6d,false,basic(0x426e70,.38));
  box(staticWorld,'潮位线',[.035,.28,22.7],[-3.45,-.78,-4.5],0x376f6c,false,basic(0x376f6c,.5));
  const frontWall = box(staticWorld,'转角岸壁',[20,2.5,.48],[6,-.32,7.23],0x8aa7a3,true);
  for(let x=-3;x<16;x+=2.1) box(staticWorld,'岸壁砌块缝',[1.9,.055,.04],[x+1,-.35,6.94],0x456f70,false,basic(0x426e70,.5));

  // Yellow/black worn safety curb around the inside of the L.
  function paintQuad(name,verts,color){
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts.flat(),3));geo.setIndex([0,1,2,0,2,3]);geo.computeVertexNormals();
    const m=new THREE.Mesh(geo,basic(color,1));m.name=name;staticWorld.add(m);return m;
  }
  function stripedCurb(x,z,length,alongZ){
    box(staticWorld,'护轮坎',alongZ?[.62,.42,length]:[length,.42,.62],[x,1.34,z],0xe2b33f,true);
    const n=Math.floor(length/1.25);
    for(let i=0;i<n;i++){
      const p=-length/2+(i+.5)*length/n;
      if(i%2===0){
        if(alongZ){
          paintQuad('警示斜纹顶面',[[x-.315,1.556,z+p-.42],[x+.315,1.556,z+p-.1],[x+.315,1.556,z+p+.42],[x-.315,1.556,z+p+.1]],C.black);
          paintQuad('警示斜纹侧面',[[x+.316,1.13,z+p-.38],[x+.316,1.13,z+p+.05],[x+.316,1.55,z+p+.38],[x+.316,1.55,z+p-.05]],C.black);
        }else{
          paintQuad('警示斜纹顶面',[[x+p-.42,1.556,z-.315],[x+p-.1,1.556,z+.315],[x+p+.42,1.556,z+.315],[x+p+.1,1.556,z-.315]],C.black);
          paintQuad('警示斜纹侧面',[[x+p-.38,1.13,z+.316],[x+p+.05,1.13,z+.316],[x+p+.38,1.55,z+.316],[x+p-.05,1.55,z+.316]],C.black);
        }
        if(i%4===0){
          if(alongZ)paintQuad('警示漆磨损',[[x+.318,1.34,z+p-.01],[x+.318,1.34,z+p+.15],[x+.318,1.45,z+p+.19],[x+.318,1.45,z+p+.03]],C.concrete);
          else paintQuad('警示漆磨损',[[x+p-.01,1.34,z+.318],[x+p+.15,1.34,z+.318],[x+p+.19,1.45,z+.318],[x+p+.03,1.45,z+.318]],C.concrete);
        }
      }
    }
  }
  stripedCurb(-4.12,-4.5,23,true); stripedCurb(6.0,7.62,20,false);

  // Water volume with a transparent sectional side and posterized animated surface.
  const waterUniforms = { time:{value:0}, cloud:{value:1}, gust:{value:0}, opacity:{value:.88} };
  const waterGeo = new THREE.PlaneGeometry(20,22.8,64,64); waterGeo.rotateX(-Math.PI/2);
  const waterMat = new THREE.ShaderMaterial({
    transparent:true, depthWrite:false, side:THREE.DoubleSide, uniforms:waterUniforms,
    vertexShader:`uniform float time;uniform float gust;varying vec2 vUv;varying float wave;void main(){vUv=uv;vec3 p=position;float w=(sin(p.x*1.9+time*.72)*.055+sin(p.z*2.7-time*.56)*.035+sin((p.x+p.z)*.78+time*.3)*.045)*(1.+gust*.72);p.y+=w;wave=w;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader:`uniform float time;uniform float cloud;uniform float opacity;varying vec2 vUv;varying float wave;void main(){float a=sin(vUv.x*54.+sin(vUv.y*18.+time)*2.)+sin(vUv.y*42.-time*.7);float band=floor((a*.5+.5)*4.)/4.;vec3 c=mix(vec3(.08,.47,.51),vec3(.36,.75,.69),band*.7+vUv.y*.18);float r=step(.925,fract(vUv.x*17.+vUv.y*11.+time*.08+sin(vUv.y*20.)*.13));c+=r*vec3(.65,.72,.55)*cloud;float stripe=smoothstep(.47,.5,abs(sin((vUv.x-vUv.y)*32.+time*.55)));c=mix(c,vec3(.71,.88,.82),stripe*.055);gl_FragColor=vec4(c,opacity);}`
  });
  const water = new THREE.Mesh(waterGeo,waterMat); water.position.set(6,.08,-4.4); water.renderOrder=2; staticWorld.add(water);
  const gustBand=new THREE.Group();gustBand.position.set(6,.17,-15.2);world.add(gustBand);
  for(let i=0;i<9;i++){
    const g=new THREE.Mesh(new THREE.PlaneGeometry(1.2+(i%3)*.72,.055),basic(0xd8f3e6,.5));g.rotation.x=-Math.PI/2;g.position.set(-8.4+i*2.05,0,(i%3-.8)*.18);g.renderOrder=5;g.material.depthTest=false;gustBand.add(g);
  }
  gustBand.visible=false;
  box(staticWorld,'半透明水体剖面',[20,1.75,22.8],[6,-.82,-4.4],0,false,new THREE.MeshPhongMaterial({color:C.water,transparent:true,opacity:.22,side:THREE.DoubleSide,depthWrite:false,shininess:80}));
  box(staticWorld,'碎石海床',[20,.18,22.8],[6,-1.67,-4.4],0x658b7d,true);
  // Layered right-side cutaway makes the water volume legible from the default overview.
  for(let i=0;i<3;i++)box(staticWorld,'水体剖面分层',[.026,.34,22.35],[16.025,-.22-i*.52,-4.4],0,false,basic(i===0?0x83d5cb:(i===1?0x3f9e99:0x256e78),.09+i*.025));
  line(staticWorld,[[16.045,.06,-15.55],[16.045,.06,6.72]],0xc7f2e7,.58);
  const sideTire=torus(staticWorld,.48,.14,[16.055,-1.05,1.9],0x263d3b,[0,Math.PI/2,0]);sideTire.scale.y=.78;
  for(let i=0;i<8;i++)torus(staticWorld,.11,.028,[16.06,-1.22,-8.6+i*.28],0x665e4d,[0,Math.PI/2,0]);

  // Underwater stones, old tire, chain and sea grass, visible through the clear side.
  const under = new THREE.Group(); staticWorld.add(under);
  for(let i=0;i<70;i++){
    const x=-3.1+(i*7.37%19.1), z=-15+(i*5.61%21.4), s=.08+(i%5)*.035;
    sphere(under,s,[x,-1.5,z],i%3===0?0xa7a98e:(i%3===1?0x789786:0x567d75),[1.4,.6,1.05]);
  }
  const tire=torus(under,.62,.18,[11.8,-1.33,3.4],0x263d3b,[Math.PI/2,.3,0]); tire.scale.y=.8;
  for(let i=0;i<12;i++) torus(under,.13,.035,[7.4+i*.27,-1.34,-11.4+Math.sin(i*.65)*.18],0x665e4d,[Math.PI/2,0,0]);
  for(let i=0;i<15;i++){
    const g=new THREE.Group(); g.position.set(-1+(i*3.47%17),-1.53,-14+(i*5.1%20)); under.add(g);
    for(let k=0;k<3;k++){ const blade=box(g,'海草',[.055,.65+(k%2)*.25,.08],[(k-1)*.12,.35,0],0x397f64,false); blade.rotation.z=(k-1)*.18; animated.seaweed.push(blade); }
  }
  // Tiny schools of fish.
  for(let i=0;i<18;i++){
    const f=new THREE.Group(); const body=sphere(f,.12,[0,0,0],i%3===0?0xe1b65c:0x4b8390,[1.7,.65,.55]);
    const tail=new THREE.Mesh(new THREE.ConeGeometry(.11,.22,3),toon(i%3===0?0xe1b65c:0x4b8390)); tail.rotation.z=-Math.PI/2; tail.position.x=-.25; f.add(tail);
    f.position.set(-1+(i*2.9%16),-1.05+(i%4)*.18,-13+(i*4.7%18)); f.userData={phase:i*.7,speed:.32+(i%5)*.03,baseZ:f.position.z}; under.add(f); animated.fish.push(f);
  }

  // Steps and low boarding platform.
  for(let i=0;i<4;i++) box(staticWorld,'下水台阶',[3.2,.32,1.05],[-1.9-i*.46,1.0-i*.31,4.8-i*.2],0xb5bbb3,true);
  box(staticWorld,'上下船平台',[4.3,.42,2.5],[1.6,.48,5.0],0xaab5ae,true);
  // Rusted ladders and mooring rings on quay face.
  for(const z of [-11,-1.2,5.5]){
    for(let i=0;i<4;i++) torus(staticWorld,.27,.045,[-3.42,.55-i*.45,z],0x88583f,[0,Math.PI/2,0],Math.PI);
    line(staticWorld,[[-3.4,.75,z-.28],[-3.4,-1.1,z-.28]],C.rust,1);
    line(staticWorld,[[-3.4,.75,z+.28],[-3.4,-1.1,z+.28]],C.rust,1);
  }
  for(const z of [-13,-8,-3,2]) torus(staticWorld,.27,.07,[-3.42,.4,z],0x795a45,[0,Math.PI/2,0]);
  // Barnacles and oysters.
  for(let i=0;i<45;i++){
    const z=-15+(i*2.13%21.5), y=-1.22+(i%5)*.16;
    const b=new THREE.Mesh(new THREE.ConeGeometry(.055+(i%3)*.025,.11,6),toon(i%2?0xd8d1b8:0xb6b69f)); b.rotation.z=-Math.PI/2; b.position.set(-3.43,y,z); staticWorld.add(b);
  }

  // Short beacon breakwater, plus a longer mist-softened outer wall at the back edge.
  const breakwater=new THREE.Group(); staticWorld.add(breakwater);
  for(let i=0;i<15;i++) box(breakwater,'防波堤块',[1.15,.85,1.5],[-1+i*1.05,.38,-13.6+(i%2)*.08],i%3===0?0xaab7af:0xb9c0b6,true);
  const outerBreakwater=new THREE.Group();staticWorld.add(outerBreakwater);
  for(let i=0;i<19;i++){
    const b=box(outerBreakwater,'远处长防波堤',[.92,.34,.58],[-5.2+i*.84,-.02,-15.34+(i%3)*.025],i%4===0?0x88a7a5:0xa8bcb6,false);
    b.material=toon(i%4===0?0x88a7a5:0xa8bcb6,{transparent:true,opacity:.48,unique:true});
  }
  for(let i=0;i<5;i++) cyl(outerBreakwater,'远堤标柱',.035,.72,[-4+i*3.25,.38,-15.28],0x6f8987,6);
  function lighthouse(parent,x,z){
    const g=new THREE.Group(); g.position.set(x,0,z); parent.add(g);
    const base=cyl(g,'灯塔基座',1.25,.7,[0,.42,0],0xa6b5ad,16);
    const tower=new THREE.Mesh(new THREE.CylinderGeometry(.55,.82,4.2,16),toon(C.white)); tower.position.y=2.75; shadowify(tower); g.add(tower); outline(tower,C.edge,.45);
    for(const y of [1.65,3.05]) cyl(g,'红色环带',y===1.65?.82:.72,.52,[0,y,0],C.red,16);
    cyl(g,'灯室',.7,.62,[0,5.05,0],0x88c8c7,14,undefined,new THREE.MeshPhongMaterial({color:0xb9efdf,transparent:true,opacity:.62,shininess:100}));
    const halo=sphere(g,.82,[0,5.05,0],0xffedac,[1.22,.52,1.22],basic(0xffedac,0));halo.renderOrder=3;
    const core=sphere(g,.22,[0,5.05,0],0xffd36c,[1,1,1],basic(0xffd36c,.08));core.renderOrder=4;
    cyl(g,'灯塔顶',.92,.28,[0,5.48,0],C.red,14); torus(g,.78,.045,[0,5.02,0],C.ink,[Math.PI/2,0,0]);
    const glow=new THREE.PointLight(0xffdf8a,0,12,2); glow.position.y=5.1; g.add(glow); g.userData={glow,core,halo}; return g;
  }
  const lighthouseObj=lighthouse(staticWorld,13.2,-13.6);
  for(let i=0;i<5;i++){ const m=new THREE.Mesh(new THREE.PlaneGeometry(10+i*2,1.3),basic(0xeaf5ef,.12+i*.015)); m.position.set(9+i*2,1.1+i*.3,-17-i*2); m.rotation.x=-.12;m.userData={baseX:m.position.x,phase:i*1.3};staticWorld.add(m);animated.mist.push(m); }

  // Hill, trees and tiled fishermen houses at the far corner.
  const hill=new THREE.Group(); staticWorld.add(hill);
  sphere(hill,3.7,[-10.5,1.6,-14.8],0x6c9b70,[1.25,.58,.5]);
  function tree(x,y,z,s){
    const g=new THREE.Group(); g.position.set(x,y,z); staticWorld.add(g);
    cyl(g,'树干',.11,1.2,[0,.6,0],0x765d48,7);
    const crowns=[]; [[0,1.3,0],[.35,1.2,.1],[-.32,1.16,.1],[.1,1.55,0]].forEach((p,i)=>{const q=sphere(g,.72,[p[0],p[1],p[2]],i%2?C.green:C.green2,[1.05,.9,1]);crowns.push(q);});
    g.scale.setScalar(s); g.userData.phase=(x+z)*.2; animated.trees.push(g); return g;
  }
  for(let i=0;i<13;i++) tree(-15+(i*1.83%8.4),2.0+(i%3)*.18,-17.0+(i*2.2%3.5),.55+(i%4)*.08);
  function house(x,z,rot){
    const g=new THREE.Group(); g.position.set(x,2.6,z); g.rotation.y=rot||0; staticWorld.add(g);
    box(g,'民家墙',[2.1,1.5,1.7],[0,.75,0],0xe9dec4,true);
    const roof=new THREE.Mesh(new THREE.CylinderGeometry(1.55,1.55,2.35,4),toon(0x52757a)); roof.rotation.z=Math.PI/2; roof.rotation.y=Math.PI/4; roof.position.y=1.75; roof.scale.z=.58; shadowify(roof); g.add(roof); outline(roof,C.edge,.45);
    box(g,'窗',[.07,.52,.64],[1.07,.84,0],0x8fc1bd,true,basic(0x77b1b2,.82)); return g;
  }
  house(-13.1,-14.5,.25); house(-8.2,-15.1,-.2); house(-10.4,-14.4,.4);

  // Helper for bollards, rain-dark rope and lamps.
  function ropeTube(parent,points,color,r){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(p[0],p[1],p[2])));const m=new THREE.Mesh(new THREE.TubeGeometry(curve,10,r||.04,6,false),ropeMaterial(color));m.castShadow=true;parent.add(m);return m;}
  function bollard(x,z,front,roped){
    const g=new THREE.Group(); g.position.set(x,1.12,z); staticWorld.add(g);
    cyl(g,'铸铁系船柱',.24,.65,[0,.34,0],C.black,10); cyl(g,'系船柱帽',.36,.15,[0,.7,0],C.black,10);
    torus(g,.33,.07,[0,.38,0],0x9d6542,[Math.PI/2,0,0]);
    if(roped){
      for(let i=0;i<3;i++)torus(g,.32+i*.018,.034,[0,.3+i*.075,0],i===2?0xb77950:0x9d6043,[Math.PI/2,0,0]);
      const tail=new THREE.Group();g.add(tail);tail.userData={phase:(x+z)*.31,front:!!front};animated.hangingRopes.push(tail);
      const dry=front?[[0,.42,-.18],[0,.2,-.72],[0,.02,-1.12]]:[[.18,.42,0],[.75,.2,0],[1.12,.02,0]];
      const wet=front?[[0,.02,-1.12],[0,-.62,-1.28],[.05,-1.42,-1.33]]:[[1.12,.02,0],[1.25,-.62,0],[1.3,-1.42,.05]];
      ropeTube(tail,dry,0xa76743,.045);ropeTube(tail,wet,0x654d42,.052);
    }
    return g;
  }
  [-13,-9,-5,-1,3,6].forEach((z,i)=>bollard(-4.8,z,false,i%2===0));
  [0,5,10,14].forEach((x,i)=>bollard(x,8.25,true,i%2===1));
  function lamp(x,z,h){
    const g=new THREE.Group(); g.position.set(x,1.12,z); staticWorld.add(g); h=h||4.7;
    cyl(g,'灯柱',.08,h,[0,h/2,0],C.ink,10);
    torus(g,.42,.065,[0,h,0],C.ink,[Math.PI/2,0,0]);
    const light=sphere(g,.24,[0,h,0],C.gold,[1,1,1],toon(0xffdc8d,{emissive:0xffc96b,emissiveIntensity:.65,unique:true}));
    for(let i=0;i<3;i++){const a=i*Math.PI*2/3+.4;const d=sphere(g,.026,[Math.cos(a)*.34,h-.12,Math.sin(a)*.34],C.gold,[.7,1.6,.7],toon(C.gold,{emissive:C.gold,emissiveIntensity:.35,unique:true}));d.userData={phase:i*.37+x*.05,baseY:h-.12,drop:.56};animated.drips.push(d);}
    return g;
  }
  lamp(-6,5.3); lamp(-13,6); lamp(-6,-5); lamp(9,9);
  line(staticWorld,[[-6,5.8,5.3],[-3,8,-1],[8,7.2,-7]],0x405b5b,.72);

  // Wet puddles with concentric ripples and clipped-looking posterized reflections.
  function puddle(x,z,s,kind){
    const p=new THREE.Mesh(new THREE.CircleGeometry(s,32),new THREE.MeshPhongMaterial({color:0x6fa7a3,transparent:true,opacity:.48,shininess:120,side:THREE.DoubleSide})); p.rotation.x=-Math.PI/2; p.position.set(x,1.145,z); staticWorld.add(p);
    const refl=new THREE.Group();refl.position.set(x,1.162,z);staticWorld.add(refl);
    const forms=kind===0?
      [[.12,1.22,-.28,.02,C.ink,.28],[.54,.16,.08,-.2,C.white,.34],[.17,.2,.16,.27,C.gold,.45]]:
      (kind===1?[[.1,1.02,.1,.02,C.ink,.3],[.5,.12,-.08,.24,C.white,.28],[.14,.18,-.2,-.2,C.gold,.42]]:
      [[.72,.18,0,-.18,C.white,.3],[.42,.16,.16,.1,C.deep,.32],[.12,.5,-.28,.04,C.ink,.26]]);
    forms.forEach((f,i)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(f[0]*s,f[1]*s),basic(f[4],f[5]));m.rotation.x=-Math.PI/2;m.position.set(f[2]*s,i*.003,f[3]*s);m.userData={baseX:m.position.x,phase:i*.8};m.renderOrder=3;m.material.depthTest=false;refl.add(m);});
    refl.userData.phase=kind*.9;animated.puddleReflections.push(refl);
    if(kind===2&&x<2){const bird=new THREE.Group();bird.position.set(x,1.169,z);staticWorld.add(bird);const bg=new THREE.BufferGeometry();bg.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,-.34,.08,0,-.07,-.06,0,0,0,0,.34,.08,0,.07,-.06,0],3));bg.setIndex([0,1,2,3,4,5]);const wing=new THREE.Mesh(bg,basic(C.ink,.24));wing.rotation.x=-Math.PI/2;wing.material.depthTest=false;wing.renderOrder=4;bird.add(wing);bird.userData={baseX:x,baseZ:z,phase:.8,wing};animated.puddleBirds.push(bird);}
    for(let i=0;i<3;i++){const r=torus(staticWorld,s*(.18+i*.18),.014,[x,1.17,z],0xc8e2d7,[Math.PI/2,0,0]);r.material=basic(0xe0efe4,.48);r.userData={phase:i*.7,base:s*(.18+i*.18)};animated.ripples.push(r);} return p;
  }
  puddle(-1,12.4,1.45,0); puddle(-10,4.6,.9,1); puddle(8.5,10.4,1.1,2); puddle(.45,8.75,.72,2);

  // Custom low-poly hull with a crisp anime silhouette.
  function hullGeometry(length,width,height){
    const top=[[-width/2,length/2],[width/2,length/2],[width/2,-length*.18],[0,-length/2],[-width/2,-length*.18]];
    const verts=[], idx=[];
    top.forEach(p=>verts.push(p[0],height*.25,p[1]));
    top.forEach(p=>verts.push(p[0]*.64,-height*.75,p[1]*.82));
    for(let i=0;i<5;i++){const n=(i+1)%5;idx.push(i,n,5+n,i,5+n,5+i);}
    idx.push(5,6,7,5,7,8,5,8,9,0,3,2,0,4,3);
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  function lifeRing(parent,x,y,z,side){
    const r=torus(parent,.32,.085,[x,y,z],C.orange,side==='x'?[0,Math.PI/2,0]:[Math.PI/2,0,0]);
    for(let i=0;i<4;i++){const a=i*Math.PI/2; const b=box(r,'白色绑带',[.14,.12,.12],[Math.cos(a)*.3,Math.sin(a)*.3,0],C.white,false);b.rotation.z=a;}
    return r;
  }
  function cabinInterior(g,cx,cz,side){
    const inside=new THREE.Group(); inside.position.set(cx,.86,cz); g.add(inside);
    // Wheel and dashboard.
    box(inside,'驾驶台',[1.38,.42,.52],[0,.27,-.48],0x456a6b,true);
    const wheel=torus(inside,.26,.035,[-.36,.64,-.74],0xc48a51,[Math.PI/2,0,0]);
    for(let a=0;a<Math.PI*2;a+=Math.PI/3) line(wheel,[[0,0,0],[Math.cos(a)*.23,Math.sin(a)*.23,0]],0xc48a51,1);
    box(inside,'雷达屏',[.48,.34,.06],[.18,.58,-.77],0x4fb8b2,true,toon(0x66d9cf,{emissive:0x38a9a8,emissiveIntensity:1.1,unique:true}));
    box(inside,'鱼探仪',[.25,.32,.07],[.54,.57,-.77],0xe6a24c,true,toon(0xefb859,{emissive:0xc7782b,emissiveIntensity:.7,unique:true}));
    // Chart and tide sheet clipped to a board.
    box(inside,'海图板',[.72,.025,.5],[-.34,.48,.15],0x8b6f53,true); 
    const chart=box(inside,'海图',[.62,.018,.42],[-.34,.78,-.25],0xe9e3c6,false); chart.rotation.x=-1.0; chart.rotation.y=.03;
    for(let i=0;i<3;i++) line(inside,[[-.6+i*.2,.8,-.36],[-.4+i*.18,.66,-.08]],0x4f9e9c,.8);
    // Thermos, enamel mug and yellow slicker.
    cyl(inside,'保温壶',.11,.48,[.5,.75,-.38],0xc8d2cb,10); cyl(inside,'保温壶盖',.13,.08,[.5,1.03,-.38],C.red,10);
    cyl(inside,'搪瓷杯',.12,.2,[.2,.68,-.38],C.white,10); torus(inside,.09,.018,[.31,.73,-.38],C.ink,[0,Math.PI/2,0],Math.PI*1.6);
    const coat=box(inside,'黄色雨衣',[.62,.92,.05],[-.68,.72,.43],C.yellow,true); coat.rotation.z=.08;
    line(inside,[[-.68,1.19,.43],[-.68,1.35,.43]],C.ink,1);
    // Amulet and catch photo on the window edge.
    box(inside,'护身符',[.09,.32,.035],[.68,.97,-.33],C.red,true);
    box(inside,'渔获照片',[.3,.21,.025],[.67,.72,-.32],0xc8dbd2,true);
    line(inside,[[.57,.74,-.345],[.76,.65,-.345]],0x4e7776,1);
    for(let i=0;i<3;i++){const c=box(inside,'舱顶粼光',[.22,.018,.85],[-.45+i*.45,1.31,-.05],0,false,basic(C.gold,.11));c.userData.phase=i*.9+(Number(side)||0)*.6;animated.caustics.push(c);}
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(.06,.42,1.35,4,1,true),basic(C.gold,.045));beam.position.set(.3,.88,-.3);beam.rotation.x=-.52;beam.userData.cloudScale=.036;inside.add(beam);animated.lightBeams.push(beam);
    return inside;
  }
  const rustPaintMat=basic(C.rust,.58),rustStreakMat=basic(0x8f5c45,.36),hullScuffMat=basic(C.deep,.16);
  function fishingBoat(x,z,scale,heading,variant){
    const g=new THREE.Group(); g.position.set(x,.35,z); g.rotation.y=heading||0; g.scale.setScalar(scale||1); world.add(g);
    const hull=new THREE.Mesh(hullGeometry(5.4,2.15,1.35),toon(C.white)); hull.position.y=.18; shadowify(hull); g.add(hull); outline(hull,C.edge,.6);
    box(g,'深青船底',[1.35,.38,3.95],[0,-.32,.18],C.deep,true);
    box(g,'船舷色带',[2.08,.13,3.65],[0,.52,.2],variant%2?C.orange:0x5597a0,false);
    box(g,'甲板',[1.78,.14,3.7],[0,.67,.18],0xdfe4d9,true);
    // open rear working well with crate and net.
    box(g,'工作舱',[1.45,.18,1.0],[0,.72,1.25],0x729b98,true);
    box(g,'鱼箱',[.58,.32,.45],[-.4,.94,1.25],variant%2?0x4c9db2:C.white,true);
    const net=new THREE.Mesh(new THREE.PlaneGeometry(1.0,.7,5,4),new THREE.MeshBasicMaterial({color:0x547f72,wireframe:true,transparent:true,opacity:.62}));net.rotation.x=-Math.PI/2;net.position.set(.15,.93,1.22);g.add(net);
    if(variant!==2){
      // Cabin walls are mostly glass so the furnished interior stays readable.
      box(g,'驾驶舱后墙',[1.66,1.55,.1],[0,1.47,.62],C.white,true);
      box(g,'驾驶舱左柱',[.1,1.55,1.62],[-.78,1.47,-.14],C.white,true);
      box(g,'驾驶舱右柱',[.1,1.55,1.62],[.78,1.47,-.14],C.white,true);
      const glassMat=new THREE.MeshPhongMaterial({color:C.glass,transparent:true,opacity:.28,shininess:120,side:THREE.DoubleSide,depthWrite:false});
      box(g,'驾驶舱前窗',[1.5,1.15,.035],[0,1.62,-.94],0,false,glassMat);
      box(g,'左舷玻璃',[.035,1.15,1.38],[-.73,1.62,-.14],0,false,glassMat);
      // Open starboard door: glass panel swung outward.
      const door=box(g,'敞开舱门',[.04,1.35,.75],[1.06,1.48,.26],0,true,glassMat); door.rotation.y=-.45;
      box(g,'舱顶',[2.02,.2,2.05],[0,2.3,-.05],C.white,true);
      for(let i=0;i<2;i++){const d=sphere(g,.026,[i?-.78:.78,2.22,.78],C.gold,[.7,1.5,.7],toon(C.gold,{emissive:C.gold,emissiveIntensity:.3,unique:true}));d.userData={phase:variant*.33+i*.48,baseY:2.22,drop:.48};animated.drips.push(d);}
      cabinInterior(g,0,-.08,variant);
      // Roof equipment and antenna.
      cyl(g,'雷达罩',.34,.38,[0,2.66,-.05],C.white,16);
      cyl(g,'桅杆',.055,2.2,[0,3.18,.18],C.ink,8);
      line(g,[[0,4.3,.18],[.72,2.4,1.42]],C.ink,.75);
      line(g,[[0,4.3,.18],[-.72,2.4,1.42]],C.ink,.75);
      box(g,'雷达横杆',[1.3,.08,.1],[0,3.63,.18],C.white,true);
      // orange pennant
      const flagGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(.05,3.95,.18),new THREE.Vector3(.7,3.78,.18),new THREE.Vector3(.05,3.62,.18)]); flagGeo.setIndex([0,1,2]);
      const flag=new THREE.Mesh(flagGeo,toon(C.orange,{side:THREE.DoubleSide,unique:true}));g.add(flag); flag.userData.phase=variant;animated.flags.push(flag);
    } else {
      box(g,'小渔船控制台',[.75,.72,.55],[0,1.1,-.45],0x5f8582,true);
      const wheel=torus(g,.23,.04,[0,1.48,-.77],C.wood,[Math.PI/2,0,0]);
      cyl(g,'遮阳架左',.04,2.1,[-.72,1.68,.1],C.ink,7);
      cyl(g,'遮阳架右',.04,2.1,[.72,1.68,.1],C.ink,7);
      box(g,'遮阳顶',[1.8,.08,2.1],[0,2.74,.08],0xe2ded0,true);
    }
    for(let i=0;i<4;i++){
      const side=i<2?-1:1,zz=i%2?1.05:-.85,d=sphere(g,.024,[side*1.04,.54,zz],C.gold,[.65,1.85,.65],toon(C.gold,{emissive:C.gold,emissiveIntensity:.38,unique:true}));
      d.userData={phase:variant*.57+i*.23,baseY:.54,drop:.42};animated.drips.push(d);
    }
    lifeRing(g,-1.1,1.25,.15,'x');
    const fenderA=torus(g,.34,.13,[1.12,.62,.85],0x2b4443,[0,Math.PI/2,0]);
    const fenderB=torus(g,.34,.13,[1.12,.62,-.7],0x2b4443,[0,Math.PI/2,0]);
    animated.fenders.push({mesh:fenderA,baseX:1.12,baseY:.62,phase:variant*1.2},{mesh:fenderB,baseX:1.12,baseY:.62,phase:variant*1.2+1.7});
    // Small, irregular paint failures and runoff marks keep the white hull clean but lived-in.
    const hullSideX=y=>1.075*(1-.36*THREE.MathUtils.clamp((.5175-y)/1.35,0,1))-.032;
    [-1,1].forEach((side,si)=>{
      for(let i=0;i<3;i++){
        const z=-.68+i*.61+(variant%2)*.08, y=.28+((i+variant+si)%3)*.055;
        const patch=new THREE.Mesh(new THREE.CircleGeometry(.07+(i%2)*.022,7),rustPaintMat);patch.position.set(side*hullSideX(y),y,z);patch.rotation.y=side>0?Math.PI/2:-Math.PI/2;patch.scale.set(.52+(i%2)*.22,1.05+(i%3)*.18,1);patch.renderOrder=4;g.add(patch);
        if(i!==1){const sy=y-.075,streak=new THREE.Mesh(new THREE.PlaneGeometry(.016,.12+i*.022),rustStreakMat);streak.position.set(side*hullSideX(sy),sy,z+.018);streak.rotation.y=patch.rotation.y;streak.renderOrder=4;g.add(streak);}
      }
      for(let i=0;i<2;i++){const sy=.2+i*.035,scuff=new THREE.Mesh(new THREE.PlaneGeometry(.18+i*.06,.016),hullScuffMat);scuff.position.set(side*hullSideX(sy),sy,-.28+i*.92);scuff.rotation.y=side>0?Math.PI/2:-Math.PI/2;scuff.rotation.z=(i?-.08:.06);scuff.renderOrder=4;g.add(scuff);}
    });
    const regTex=canvasTexture([{text:'FK-'+(31+variant*7),size:54}],'#f3f0df','#3e7477',256,96);
    const reg=new THREE.Mesh(new THREE.PlaneGeometry(.9,.3),new THREE.MeshBasicMaterial({map:regTex,transparent:true}));reg.position.set(1.086,.55,-1.0);reg.rotation.y=Math.PI/2;g.add(reg);
    g.userData={baseY:g.position.y,phase:variant*1.7,home:new THREE.Vector3(x,.35,z),heading:heading||0}; animated.boats.push(g); return g;
  }
  const boatA=fishingBoat(-.25,-7.7,.82,0,0);
  const boatB=fishingBoat(3.2,-2.7,.93,-.08,1);
  const boatC=fishingBoat(7.6,2.2,.76,.08,2);
  const boatD=fishingBoat(11.6,-7.2,.72,-.18,3);
  function boatReflection(boat,scale,phase){
    const g=new THREE.Group();g.position.set(boat.position.x,.145,boat.position.z);world.add(g);
    const pieces=[
      [1.45*scale,4.2*scale,0,0,C.deep,.25],
      [.78*scale,2.1*scale,-.46*scale,.25*scale,C.white,.23],
      [.55*scale,1.2*scale,.55*scale,-.55*scale,0x277e83,.34],
      [.88*scale,.52*scale,-.18*scale,1.55*scale,C.waterLight,.3],
      [.62*scale,.38*scale,.42*scale,-1.45*scale,C.white,.28]
    ];
    pieces.forEach((p,i)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(p[0],p[1]),basic(p[4],p[5]));m.rotation.x=-Math.PI/2;m.position.set(p[2],i*.002,p[3]);m.userData.baseX=p[2];m.renderOrder=4;m.material.depthTest=false;g.add(m);});
    g.userData={boat,phase};animated.reflections.push(g);return g;
  }
  boatReflection(boatA,.82,.2);boatReflection(boatB,.93,1.3);boatReflection(boatC,.76,2.2);boatReflection(boatD,.72,3.1);

  // A tiny working boat crosses behind the outer wall to keep the far layer alive.
  const distantBoat=new THREE.Group();distantBoat.position.set(-9,.3,-15.08);distantBoat.rotation.y=Math.PI/2;world.add(distantBoat);
  const distantHull=new THREE.Mesh(hullGeometry(2.25,.82,.55),toon(0xdce7df,{transparent:true,opacity:.68,unique:true}));distantHull.position.y=.12;distantBoat.add(distantHull);outline(distantHull,0x648486,.28);
  box(distantBoat,'远航渔船舱',[.62,.48,.72],[0,.48,.05],0xc8dbd5,false,toon(0xc8dbd5,{transparent:true,opacity:.62,unique:true}));
  cyl(distantBoat,'远船桅杆',.025,1.1,[0,1.16,0],0x607c7b,6);line(distantBoat,[[0,1.7,0],[.35,.76,.55]],0x6d8583,.5);
  distantBoat.userData={baseZ:-15.08};animated.distantBoat=distantBoat;

  // Warehouse shell: open front and raised roller door reveal a fully dressed interior.
  function buildWarehouse(){
    const g=new THREE.Group(); g.position.set(-11.5,1.12,-8.7); staticWorld.add(g);
    box(g,'仓库后墙',[6.6,4.3,.25],[0,2.15,-3.0],0xc7c5b8,true);
    box(g,'仓库左墙',[.24,4.3,6],[-3.2,2.15,0],0xc7c5b8,true);
    box(g,'仓库右墙',[.24,4.3,2.8],[3.2,2.15,-1.6],0xc7c5b8,true);
    box(g,'仓库屋顶',[6.9,.28,6.4],[0,4.42,0],0x638489,true);
    // front opening faces +z toward the camera; shutter only covers upper half
    box(g,'半拉卷帘门',[6.15,1.42,.12],[0,3.63,3.02],0xa4aaa5,true);
    for(let y=3.03;y<4.2;y+=.18) box(g,'卷帘纹',[6.05,.025,.13],[0,y,3.1],0x6f8582,false);
    const whSignTex=canvasTexture([{text:'日和漁協　倉庫',size:38}],'#dcd8c5','#3d7170',512,120);const whSign=new THREE.Mesh(new THREE.PlaneGeometry(2.7,.58),new THREE.MeshBasicMaterial({map:whSignTex}));whSign.position.set(0,3.72,3.18);g.add(whSign);
    box(g,'仓库门框',[.25,4.2,.28],[-3.18,2.1,3.04],0x527074,true); box(g,'仓库门框',[.25,4.2,.28],[3.18,2.1,3.04],0x527074,true);
    box(g,'仓库湿地面',[6.1,.08,5.7],[0,.08,0],0x789d98,true,new THREE.MeshPhongMaterial({color:0x8faea6,shininess:120}));
    // stacked crates, ice chest, scale and boots
    for(let i=0;i<14;i++) box(g,'鱼箱',[1.0,.4,.72],[-2.2+(i%3)*1.05,.3+Math.floor(i/6)*.43,-1.7+(Math.floor(i/3)%2)*.8],i%4===0?0x4d91a1:C.white,true);
    box(g,'冰柜',[1.75,1.0,.95],[1.8,.55,-1.85],0xe8e9df,true); box(g,'冰柜盖',[1.7,.08,.9],[1.8,1.08,-1.85],0xb7cfca,true);
    cyl(g,'磅秤底座',.48,.15,[1.3,.15,.2],0x647f7c,10); box(g,'磅秤台',[.82,.12,.72],[1.3,.35,.2],0x94aaa3,true);
    cyl(g,'磅秤杆',.04,1.1,[1.3,.92,.25],C.ink,7); box(g,'磅秤表盘',[.52,.52,.12],[1.3,1.43,.25],0xe9e3c9,true);
    for(const x of [1.72,2.16]){ const boot=box(g,'雨靴',[.28,.65,.42],[x,1.62,-2.84],C.yellow,true);boot.rotation.x=.04; }
    // auction board on the back wall
    const blackboardTex=canvasTexture([{text:'本日入札',size:42},{text:'鯵  580　鯛  920',size:30},{text:'しらす  360',size:30}],'#315c58','#f1e8c9',512,300);
    const board=new THREE.Mesh(new THREE.PlaneGeometry(2.4,1.1),new THREE.MeshBasicMaterial({map:blackboardTex})); board.position.set(.05,1.76,-2.86); g.add(board);
    // reflective puddle, loose ice and sun shafts through clerestory
    const ip=basic(0xdaf7ef,.62); const floorPuddle=new THREE.Mesh(new THREE.CircleGeometry(1.15,24),ip);floorPuddle.rotation.x=-Math.PI/2;floorPuddle.position.set(.6,.14,1.3);g.add(floorPuddle);
    for(let i=0;i<12;i++) box(g,'散落冰块',[.16,.1,.12],[-.5+(i*.53%2.8),.16,.7+(i*.77%1.8)],0xc7eeea,true,toon(0xc7eeea,{transparent:true,opacity:.74,unique:true}));
    for(const x of [-2,1.8]) box(g,'高窗',[1.15,.72,.04],[x,3.28,-2.85],0,true,new THREE.MeshPhongMaterial({color:C.glass,transparent:true,opacity:.4,shininess:120}));
    for(const x of [-2,1.8]){const beam=new THREE.Mesh(new THREE.CylinderGeometry(.25,.85,4.1,8,1,true),basic(C.gold,.09));beam.position.set(x,1.8,-.8);beam.rotation.x=-.28;g.add(beam);animated.lightBeams.push(beam);}
    // moving caustic strips are animated later
    for(let i=0;i<5;i++){const c=box(g,'天花板粼光',[.7,.025,3.6],[-2+i,4.25,0],0,false,basic(C.gold,.16));c.userData.phase=i*.8;animated.caustics.push(c);}
    return g;
  }
  const warehouse=buildWarehouse();

  function buildWaitingRoom(){
    const g=new THREE.Group(); g.position.set(-11.25,1.12,1.2); staticWorld.add(g);
    box(g,'候船室后墙',[6.8,3.75,.25],[0,1.88,-2.2],0xd8d1bd,true);
    box(g,'候船室侧墙',[.25,3.75,4.5],[-3.28,1.88,0],0xd8d1bd,true);
    box(g,'候船室侧墙',[.25,3.75,4.5],[3.28,1.88,0],0xd8d1bd,true);
    box(g,'候船室屋顶',[7,.3,4.8],[0,3.9,0],0x68888c,true);
    const glassMat=new THREE.MeshPhongMaterial({color:0xa4d6d2,transparent:true,opacity:.25,shininess:140,side:THREE.DoubleSide,depthWrite:false});
    for(const x of [-2.45,-.82,.82,2.45]) box(g,'落地玻璃',[1.52,3.25,.055],[x,1.72,2.23],0,true,glassMat);
    for(const x of [-1.64,0,1.64]) box(g,'玻璃窗框',[.08,3.45,.12],[x,1.8,2.25],C.ink,true);
    const waitSignTex=canvasTexture([{text:'連絡船　待合所',size:40}],'#e5dfc9','#477578',512,120);const waitSign=new THREE.Mesh(new THREE.PlaneGeometry(2.75,.62),new THREE.MeshBasicMaterial({map:waitSignTex}));waitSign.position.set(0,3.5,2.31);g.add(waitSign);
    // bench
    box(g,'木长椅座',[4.1,.23,.7],[-.3,.82,-.45],C.wood,true); box(g,'木长椅背',[4.1,.88,.18],[-.3,1.35,-.77],C.wood,true);
    for(const x of [-1.8,1.2]){box(g,'长椅腿',[.16,.75,.16],[x,.4,-.45],C.ink,true);}
    // radio, kettle, plant and clock
    box(g,'老式收音机',[1,.62,.42],[1.4,1.22,-.35],0x926c4f,true);
    torus(g,.17,.025,[1.18,1.25,-.12],0xd3c498,[0,0,0]);
    box(g,'收音机调谐窗',[.34,.11,.03],[1.57,1.4,-.12],0xe1c98f,true,basic(0xe1c98f,.94));
    cyl(g,'调频旋钮',.06,.06,[1.68,1.21,-.11],0xd5c48d,10,[Math.PI/2,0,0]);
    line(g,[[1.7,1.54,-.25],[1.96,2.2,-.25]],C.ink,.82);
    cyl(g,'热水壶',.3,.55,[-1.75,1.14,-.35],0xd5d9cf,12); torus(g,.34,.04,[-1.75,1.46,-.35],C.ink,[0,0,0],Math.PI);
    cyl(g,'花盆',.28,.35,[2.2,.2,.65],0xc87952,10); for(let i=0;i<8;i++){const leaf=sphere(g,.18,[2.2+Math.cos(i)*.28,.55+(i%3)*.18,.65+Math.sin(i)*.22],0x4f9867,[.7,1.5,.5]);leaf.rotation.z=i*.6;}
    const clockFace=new THREE.Mesh(new THREE.CircleGeometry(.45,24),basic(0xeee9d5,1));clockFace.position.set(1.65,2.8,-2.05);clockFace.rotation.z=.08;g.add(clockFace);torus(g,.46,.04,[1.65,2.8,-2.04],0x5a6965,[0,0,0]);line(g,[[1.65,2.8,-2.02],[1.48,3.0,-2.02]],C.ink,1);line(g,[[1.65,2.8,-2.02],[1.9,2.75,-2.02]],C.ink,1);
    const timetableTex=canvasTexture([{text:'連絡船 時刻表',size:36},{text:'08:20  11:45  16:10',size:25},{text:'雨天運航',size:24}],'#e9e0c6','#477578',512,240);
    const timetable=new THREE.Mesh(new THREE.PlaneGeometry(2.2,1.05),new THREE.MeshBasicMaterial({map:timetableTex}));timetable.position.set(-.7,2.65,-2.04);g.add(timetable);
    return g;
  }
  const waitingRoom=buildWaitingRoom();

  // Dense working-port props along the foreground apron.
  function cylinderBetween(parent,a,b,r,color,segments,material){
    const va=new THREE.Vector3(a[0],a[1],a[2]), vb=new THREE.Vector3(b[0],b[1],b[2]);
    const mid=va.clone().add(vb).multiplyScalar(.5), dir=vb.clone().sub(va);
    const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,dir.length(),segments||8),material||toon(color));
    m.position.copy(mid);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());shadowify(m);parent.add(m);return m;
  }
  // World-space lines connect moving hull cleats to fixed quay rings or buoys.
  // Two short tube segments allow a visible, gently changing catenary sag.
  function mooring(boat,localPoint,shorePoint,phase,releases){
    const g=new THREE.Group();world.add(g);
    const mat=ropeMaterial(0xa25f43).clone();mat.transparent=true;mat.opacity=.9;
    const make=()=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,1,7),mat);m.castShadow=true;g.add(m);return m;};
    const item={boat,local:new THREE.Vector3().fromArray(localPoint),shore:new THREE.Vector3().fromArray(shorePoint),phase,releases:!!releases,group:g,material:mat,segments:[make(),make()]};
    animated.moorings.push(item);return item;
  }
  mooring(boatA,[-.9,.78,1.45],[-4.72,1.45,-6.3],.2,false);
  mooring(boatA,[-.9,.78,-1.45],[-4.72,1.45,-9.2],1.4,false);
  mooring(boatB,[-.9,.78,-1.35],[-4.72,1.45,-2.2],2.1,false);
  mooring(boatC,[.75,.78,1.25],[7.1,1.45,7.72],2.8,false);
  mooring(boatC,[-.75,.78,1.25],[9.0,1.45,7.72],3.6,false);
  mooring(boatD,[.8,.78,-1.25],[13,.58,-2.2],4.4,true);
  const props=new THREE.Group();staticWorld.add(props);
  // Fine aggregate wear and old drag marks across the broad wet apron.
  for(let i=0;i<38;i++){
    const x=-15+(i*4.37%29),z=8.1+(i*3.17%7.3),r=.025+(i%5)*.014;
    const mark=new THREE.Mesh(new THREE.CircleGeometry(r,7),basic(i%4===0?0x8b9e98:0xaeb7ae,.28));mark.rotation.x=-Math.PI/2;mark.position.set(x,1.155,z);props.add(mark);
  }
  for(let i=0;i<5;i++) line(props,[[-13+i*2.1,1.165,14.2],[-11.6+i*2.1,1.165,13.65]],0x879b95,.22);
  // Coiled rope and a few wooden chocks: quiet evidence of recent work.
  const ropeCoil=new THREE.Group();ropeCoil.position.set(-8.2,1.22,12.8);props.add(ropeCoil);
  for(let i=0;i<5;i++){const r=torus(ropeCoil,.38+i*.08,.035,[0,i*.02,0],i%2?0xa96743:0xb6784d,[Math.PI/2,0,0]);r.scale.z=.74;}
  box(props,'木楔',[.68,.22,.32],[-6.8,1.27,13.2],C.wood,true).rotation.y=.24;
  box(props,'木楔',[.62,.2,.3],[-6.25,1.25,12.75],0x806044,true).rotation.y=-.18;
  // Fish crates: white and blue, with visible slotted sides.
  function crate(x,y,z,color,rot){
    const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=rot||0;props.add(g);
    box(g,'鱼箱底',[1.35,.12,.82],[0,.06,0],color,true);
    for(const xx of [-.63,.63]) box(g,'鱼箱侧',[.09,.48,.82],[xx,.3,0],color,true);
    for(const zz of [-.37,.37]) box(g,'鱼箱侧',[1.25,.48,.08],[0,.3,zz],color,true);
    return g;
  }
  crate(-2.1,1.13,10.2,C.white,.1);crate(-2,1.67,10.15,C.white,-.04);crate(-.65,1.13,10.3,0x4c99ae,-.1);crate(-1,1.13,11.3,0x4c99ae,.07);
  // Drying rack, net grid and float garland.
  const rack=new THREE.Group();rack.position.set(-7.1,1.15,8.6);props.add(rack);
  for(const x of [-1.45,1.45]){cyl(rack,'晒网架',.055,2.75,[x,1.35,0],C.ink,8);}
  cylinderBetween(rack,[-1.55,2.67,0],[1.55,2.67,0],.055,C.ink,8);
  const netGeo=new THREE.PlaneGeometry(2.7,1.7,9,7);const netMat=new THREE.MeshBasicMaterial({color:0x527b69,wireframe:true,transparent:true,opacity:.63,side:THREE.DoubleSide});
  const dryingNet=new THREE.Mesh(netGeo,netMat);dryingNet.position.set(0,1.7,.03);rack.add(dryingNet);dryingNet.userData.phase=1.2;animated.flags.push(dryingNet);
  for(let i=0;i<9;i++){const fl=sphere(rack,.105,[-1.3+i*.33,2.55+Math.sin(i*.8)*.07,.08],i%2?C.orange:C.white,[1,1,1]);fl.userData.phase=i*.3;animated.flags.push(fl);}
  // Rusty hand winch and small davit.
  const winch=new THREE.Group();winch.position.set(4.5,1.15,11.3);props.add(winch);
  box(winch,'绞盘底座',[1.3,.2,.8],[0,.1,0],C.rust,true);cyl(winch,'绞盘轴',.3,.82,[0,.72,0],0x705d4b,12,[0,0,Math.PI/2]);
  torus(winch,.6,.055,[.52,.72,0],C.rust,[0,Math.PI/2,0]); for(let a=0;a<Math.PI*2;a+=Math.PI/4) line(winch,[[.52,.72,0],[.52,.72+Math.cos(a)*.55,Math.sin(a)*.55]],C.rust,1);
  cylinderBetween(winch,[.9,.15,.1],[.9,3.1,.1],.07,C.rust,8);cylinderBetween(winch,[.9,3.1,.1],[2.1,3.05,.1],.07,C.rust,8);line(winch,[[2.05,3.05,.1],[2.05,1.15,.1]],0x584f43,.9);torus(winch,.12,.025,[2.05,1.05,.1],C.rust,[0,0,0]);
  // Numbered mooring buoys on the water.
  function buoy(x,z,n){const g=new THREE.Group();g.position.set(x,.17,z);world.add(g);cyl(g,'系船浮标',.38,.58,[0,.28,0],n%2?C.orange:C.yellow,12);cyl(g,'浮标颈',.09,.45,[0,.76,0],C.ink,8);const t=canvasTexture([{text:String(n).padStart(2,'0'),size:58}],'#e37842','#fff6d8',128,96);const p=new THREE.Mesh(new THREE.PlaneGeometry(.45,.3),new THREE.MeshBasicMaterial({map:t}));p.position.set(0,.33,.39);g.add(p);g.userData={phase:n,baseY:.17};animated.buoys.push(g);return g;}
  buoy(1.2,-12.0,3);buoy(8.5,-10.2,7);buoy(13,-2.2,12);
  // Long-handled landing nets and buckets against the waiting-room wall.
  for(let i=0;i<2;i++){cylinderBetween(props,[-8.2+i*.45,1.2,4.0],[-8.1+i*.45,3.5,4.15],.035,C.wood,7);torus(props,.32,.026,[-8.08+i*.45,3.63,4.16],C.ink,[0,0,0]);}
  cyl(props,'水桶',.35,.55,[-7.2,1.44,4.0],0x4b91a2,14);torus(props,.4,.025,[-7.2,1.75,4.0],C.ink,[0,0,0],Math.PI);
  // Glowing old vending machine with rusty awning.
  const vending=new THREE.Group();vending.position.set(-7.0,1.15,2.8);vending.rotation.y=.04;props.add(vending);
  box(vending,'自动贩卖机',[1.45,2.55,.85],[0,1.28,0],0xd8d6c9,true);
  box(vending,'贩卖机灯箱',[1.14,.52,.045],[0,2.16,.445],0,true,toon(0xf6e7b2,{emissive:0xffcf71,emissiveIntensity:.7,unique:true}));
  for(let r=0;r<2;r++)for(let c=0;c<4;c++) box(vending,'饮料按钮',[.2,.28,.04],[-.38+c*.25,1.48-r*.36,.45],c%2?0x83b6b2:C.orange,true,toon(c%2?0x83b6b2:C.orange,{emissive:c%2?0x336d70:0x8c3f24,emissiveIntensity:.25,unique:true}));
  box(vending,'出货口',[.68,.32,.04],[.18,.52,.45],C.black,true);const awn=box(vending,'锈蚀遮雨檐',[1.8,.12,1.18],[0,2.72,.1],C.rust,true);awn.rotation.x=.08;
  // Sloped ramp and an overturned wooden sampan; a cat shelters below.
  const slip=box(props,'斜坡滑道',[5.0,.35,4.2],[10.2,.7,12.3],0xaebbb2,true);slip.rotation.x=-.12;
  const sampan=new THREE.Group();sampan.position.set(11.5,1.7,12.0);sampan.rotation.set(0,.55,Math.PI);props.add(sampan);
  const boatShell=new THREE.Mesh(hullGeometry(3.6,1.45,.8),toon(C.wood));shadowify(boatShell);sampan.add(boatShell);outline(boatShell,C.edge,.6);
  for(const z of [-.9,0,.9]) box(sampan,'舢板肋条',[1.2,.08,.08],[0,.32,z],0x6f513c,true);
  const cat=new THREE.Group();cat.position.set(10.8,1.28,12.0);props.add(cat);
  const catBody=sphere(cat,.32,[0,.25,0],0x596b68,[1.35,.72,.72]);const catHead=sphere(cat,.24,[.38,.38,0],0x596b68,[1,1,1]);
  for(const zz of [-.13,.13]){const ear=new THREE.Mesh(new THREE.ConeGeometry(.1,.22,3),toon(0x596b68));ear.position.set(.38,.65,zz);cat.add(ear);}
  for(const zz of [-.105,.105]){sphere(cat,.048,[.585,.44,zz],0xe8cd78,[.55,1,.75]);sphere(cat,.024,[.62,.44,zz],C.ink,[.55,1,.75]);}
  sphere(cat,.032,[.62,.34,0],0xd9877d,[.7,.7,.7]);
  for(const side of [-1,1])for(let i=0;i<2;i++)line(cat,[[.59,.32,side*.04],[.78,.32+(i-.5)*.07,side*(.16+i*.05)]],0x405d5d,.72);
  const catPaws=[];for(const x of [-.18,.22])for(const z of [-.16,.16])catPaws.push(cyl(cat,'猫腿',.045,.23,[x,.1,z],0x50615f,7));
  torus(cat,.46,.045,[-.25,.32,0],0x596b68,[Math.PI/2,.3,0],Math.PI*1.45);cat.userData={baseX:10.8,baseZ:12,phase:0,paws:catPaws};animated.cat=cat;
  // Faded harbor warning sign.
  const signTex=canvasTexture([{text:'日和漁港',size:50},{text:'注意落水',size:54}],'#e9dfb8','#c85842',512,330);
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(2.2,1.35),new THREE.MeshBasicMaterial({map:signTex}));sign.position.set(7.2,3.15,10.02);sign.rotation.y=.06;props.add(sign);
  cyl(props,'告示牌柱',.07,2.2,[6.35,2.15,10.1],C.ink,8);cyl(props,'告示牌柱',.07,2.2,[8.05,2.15,10.1],C.ink,8);
  // Windsock and little flags.
  const windsock=new THREE.Group();windsock.position.set(13,1.1,8.7);props.add(windsock);cyl(windsock,'风向杆',.055,4.3,[0,2.15,0],C.ink,8);
  const sockMat=toon(C.orange,{side:THREE.DoubleSide,unique:true});const sock=new THREE.Mesh(new THREE.CylinderGeometry(.12,.35,1.55,12,1,true),sockMat);sock.rotation.z=Math.PI/2;sock.position.set(.78,4.08,0);windsock.add(sock);sock.userData.phase=2;animated.flags.push(sock);
  for(let i=0;i<5;i++){const fg=new THREE.BufferGeometry();fg.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,.55,-.12,0,0,-.3,0],3));fg.setIndex([0,1,2]);const f=new THREE.Mesh(fg,toon(i%2?C.yellow:C.red,{side:THREE.DoubleSide,unique:true}));f.position.set(-8+i*1.1,3.7,7.5);staticWorld.add(f);animated.flags.push(f);}
  // Two silver instrument cases and the transparent umbrella.
  function instrumentCase(x,z,rot,longCase){const g=new THREE.Group();g.position.set(x,1.25,z);g.rotation.y=rot;props.add(g);box(g,'银灰乐器硬箱',longCase?[2.4,.34,.68]:[1.65,.34,.86],[0,.17,0],0x889b99,true,new THREE.MeshPhongMaterial({color:0x9caaa6,shininess:85}));for(const xx of [-.5,.5])box(g,'箱扣',[.14,.12,.08],[xx,.37,.35],0xd9c98e,true);torus(g,.25,.035,[0,.34,-.4],C.ink,[Math.PI/2,0,0],Math.PI);return g;}
  instrumentCase(2.35,9.55,-.08,true);instrumentCase(4.25,9.4,.06,false);
  const umbrella=new THREE.Group();umbrella.position.set(-.3,1.15,6.25);umbrella.rotation.z=-.32;umbrella.scale.setScalar(.82);props.add(umbrella);
  cyl(umbrella,'伞柄',.035,2.8,[0,1.35,0],0x587777,10);
  const canopy=new THREE.Mesh(new THREE.ConeGeometry(1.35,.62,16,1,true),new THREE.MeshPhongMaterial({color:0x8fd5d2,transparent:true,opacity:.46,shininess:140,side:THREE.DoubleSide,depthWrite:false}));canopy.position.y=2.55;umbrella.add(canopy);outline(canopy,0x547f82,.76);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;line(umbrella,[[0,2.86,0],[Math.cos(a)*1.31,2.24,Math.sin(a)*1.31]],0x4f797c,.82);}
  torus(umbrella,.19,.035,[0,-.07,0],C.ink,[0,0,0],Math.PI); 
  for(let i=0;i<10;i++){const d=sphere(umbrella,.035,[Math.cos(i*.63)*1.15,2.23+Math.sin(i*.8)*.05,Math.sin(i*.63)*1.15],C.gold,[.6,1.7,.6],toon(C.gold,{emissive:C.gold,emissiveIntensity:.5,unique:true}));d.userData={phase:i,baseY:d.position.y,drop:.75};animated.drips.push(d);}
  // Concrete tetrapods and restrained foam at the outer corner.
  function tetrapod(x,y,z,s,rot){const g=new THREE.Group();g.position.set(x,y,z);g.rotation.set(rot*.3,rot,rot*.2);staticWorld.add(g);sphere(g,.42*s,[0,0,0],0xadb8b0,[1,1,1]);[[0,1,0],[.9,-.45,.2],[-.65,-.45,.7],[-.45,-.45,-.85]].forEach(v=>cylinderBetween(g,[0,0,0],[v[0]*s,v[1]*s,v[2]*s],.22*s,0xaeb9b1,7));return g;}
  tetrapod(14.8,.4,5.3,.95,.2);tetrapod(15.2,.2,3.9,.9,1.1);tetrapod(13.7,.25,4.4,.8,2.2);tetrapod(14.2,.05,2.9,.75,.6);
  for(let i=0;i<12;i++){const f=new THREE.Mesh(new THREE.CircleGeometry(.18+(i%3)*.08,12),basic(C.white,.62));f.rotation.x=-Math.PI/2;f.position.set(13.4+(i*.57%2.4),.18,2.7+(i*.91%3.4));staticWorld.add(f);f.userData.phase=i*.55;animated.foam.push(f);}

  // Stylized seagulls: a few circle the harbor, one rests on a bollard.
  function gull(x,y,z,phase,perched){
    const g=new THREE.Group();g.position.set(x,y,z);world.add(g);const body=sphere(g,.13,[0,0,0],C.white,[1.6,.65,.7]);outline(body,C.ink,.5);
    const makeWing=sign=>{const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,sign*.72,.06,.05,sign*.18,-.08,0],3));geo.setIndex([0,1,2]);geo.computeVertexNormals();const wing=new THREE.Mesh(geo,toon(C.white,{side:THREE.DoubleSide,unique:true}));g.add(wing);outline(wing,C.ink,.55);return wing;};
    const wingL=makeWing(-1),wingR=makeWing(1),legs=new THREE.Group();g.add(legs);
    for(const zOff of [-.055,.055]){cyl(legs,'海鸥细腿',.012,.16,[.02,-.15,zOff],C.yellow,5);line(legs,[[.02,-.23,zOff],[.13,-.23,zOff-.025]],C.yellow,1);}
    const beak=new THREE.Mesh(new THREE.ConeGeometry(.045,.22,4),toon(C.yellow));beak.rotation.z=-Math.PI/2;beak.position.x=.28;g.add(beak);
    g.userData={phase,base:new THREE.Vector3(x,y,z),wingL,wingR,legs,perched:!!perched};animated.gulls.push(g);return g;
  }
  function poseGullWings(u,flap,fold){
    const span=1-fold*.62,lift=flap*(1-fold*.7);u.wingL.scale.x=span;u.wingR.scale.x=span;
    u.wingL.rotation.set(0,fold*.88,-lift);u.wingR.rotation.set(0,-fold*.88,lift);u.legs.visible=fold>.5;
  }
  gull(-4.8,2.3,-9,0,true);
  const gullB=gull(2,8,-2,1.5,false);gullB.userData.landing={point:new THREE.Vector3(5,2.05,8.25),yaw:-.4};
  const gullC=gull(8,7,-8,3,false);gullC.userData.landing={boat:boatB,local:new THREE.Vector3(0,2.78,-.05),yaw:.2};
  const gullD=gull(-7,9,4,4.4,false);gullD.userData.landing={point:new THREE.Vector3(6,.34,-11),yaw:1.1};

  // Golden diagonal sun-shower streaks; no image textures or external assets.
  const rainCount=620, rainPos=new Float32Array(rainCount*6);
  for(let i=0;i<rainCount;i++){const x=-20+(i*7.913%40),y=1+(i*5.731%21),z=-20+(i*11.17%40),j=i*6;rainPos[j]=x;rainPos[j+1]=y;rainPos[j+2]=z;rainPos[j+3]=x+.1;rainPos[j+4]=y-.48;rainPos[j+5]=z+.07;}
  const rainGeo=new THREE.BufferGeometry();rainGeo.setAttribute('position',new THREE.BufferAttribute(rainPos,3));
  const rain=new THREE.LineSegments(rainGeo,new THREE.LineBasicMaterial({color:0xffe8a6,transparent:true,opacity:.38,depthWrite:false}));rain.frustumCulled=false;scene.add(rain);
  const rainInitial=rainPos.slice();

  // A chain of flat graphic wake fragments follows the outer boat on departure.
  const wake=new THREE.Group();world.add(wake);
  for(let i=0;i<24;i++){
    const w=new THREE.Mesh(new THREE.RingGeometry(.18+i*.026,.23+i*.028,14,1,0,Math.PI),basic(0xf5fff5,.55));
    w.rotation.x=-Math.PI/2;w.rotation.z=(i%2?1:-1)*.18;w.position.y=.16;w.visible=false;w.renderOrder=5;w.material.depthTest=false;wake.add(w);
  }
  const wakeSlaps=new THREE.Group();world.add(wakeSlaps);
  for(let i=0;i<7;i++){const s=new THREE.Mesh(new THREE.RingGeometry(.22,.3,12,1,0,Math.PI),basic(0xf5fff5,.5));s.rotation.x=-Math.PI/2;s.rotation.z=Math.PI/2+(i%2-.5)*.22;s.position.set(-3.25,.17,-12.4+i*.92);s.visible=false;s.renderOrder=5;s.material.depthTest=false;s.userData.phase=i*.13;wakeSlaps.add(s);animated.wakeSlaps.push(s);}
  const departureCurve=new THREE.CatmullRomCurve3([
    new THREE.Vector3(11.6,.35,-7.2),new THREE.Vector3(7.0,.35,-6.5),
    new THREE.Vector3(2.0,.35,-7.5),new THREE.Vector3(-2.7,.35,-9.5),
    new THREE.Vector3(-3.0,.35,-13.5),new THREE.Vector3(1.5,.35,-15.0),
    new THREE.Vector3(7.0,.35,-14.8),new THREE.Vector3(11.6,.35,-7.2)
  ],false,'catmullrom',.35);

  // Orbit interaction designed for a display-case miniature.
  const orbit={azimuth:.74,polar:1.02,radius:60,target:new THREE.Vector3(0,0,0),drag:false,x:0,y:0,lastRadius:60,approach:0};
  function applyOrbit(){const sp=Math.sin(orbit.polar);camera.position.set(orbit.target.x+orbit.radius*sp*Math.sin(orbit.azimuth),orbit.target.y+orbit.radius*Math.cos(orbit.polar),orbit.target.z+orbit.radius*sp*Math.cos(orbit.azimuth));camera.lookAt(orbit.target);}
  applyOrbit();
  const dom=renderer.domElement;
  dom.addEventListener('pointerdown',e=>{orbit.drag=true;orbit.x=e.clientX;orbit.y=e.clientY;dom.setPointerCapture(e.pointerId);});
  dom.addEventListener('pointermove',e=>{if(!orbit.drag)return;const dx=e.clientX-orbit.x,dy=e.clientY-orbit.y;orbit.x=e.clientX;orbit.y=e.clientY;orbit.azimuth-=dx*.006;orbit.polar=Math.max(.24,Math.min(1.48,orbit.polar+dy*.005));applyOrbit();});
  dom.addEventListener('pointerup',e=>{orbit.drag=false;try{dom.releasePointerCapture(e.pointerId);}catch(_){}});
  dom.addEventListener('wheel',e=>{e.preventDefault();const old=orbit.radius;orbit.radius=Math.max(8,Math.min(62,orbit.radius*Math.exp(e.deltaY*.001)));if(orbit.radius<old-.2)orbit.approach=2.2;applyOrbit();},{passive:false});
  dom.addEventListener('dblclick',()=>{orbit.azimuth=.74;orbit.polar=1.02;orbit.radius=60;orbit.target.set(0,0,0);applyOrbit();});

  let sceneTime=0,last=performance.now(),exporting=false;
  function departureProgress(t){
    if(exporting){return t<51.5?0:Math.min(.58,(t-51.5)/8.5*.58);}
    const q=t%78;if(q<43||q>69)return 0;return (q-43)/26;
  }
  function updateDeparture(t){
    const u=departureProgress(t),moving=u>0;
    if(!moving){boatD.position.copy(boatD.userData.home);boatD.rotation.y=boatD.userData.heading;wake.children.forEach(w=>w.visible=false);return;}
    const p=departureCurve.getPointAt(Math.min(.999,u)),ahead=departureCurve.getPointAt(Math.min(.999,u+.006));
    boatD.position.copy(p);boatD.position.y+=Math.sin(t*.75)*.045;boatD.rotation.y=Math.atan2(ahead.x-p.x,ahead.z-p.z);
    for(let i=0;i<wake.children.length;i++){
      const w=wake.children[i],wu=u-i*.008;w.visible=wu>.002;
      if(w.visible){const wp=departureCurve.getPointAt(Math.max(0,wu));w.position.set(wp.x,.145,wp.z);w.scale.setScalar(.55+i*.045);w.material.opacity=.5*(1-i/wake.children.length);}
    }
  }
  function update(t,dt){
    sceneTime=t;waterUniforms.time.value=t;
    const seaGust=gustWave(t,0),gustQ=gustClock(t);
    waterUniforms.gust.value=seaGust;
    gustBand.visible=gustQ<=7;
    gustBand.position.z=-15.2+Math.min(1,gustQ/7)*22.1;
    gustBand.children.forEach((g,i)=>{g.material.opacity=(gustBand.visible ? .18 : 0)*Math.sin(Math.min(1,gustQ/7)*Math.PI)*(i%2 ? .75 : 1);});
    // Gentle non-uniform motion, never all objects in sync.
    animated.boats.forEach((b,i)=>{if(!b.userData.baseY)return;b.position.y=b.userData.baseY+Math.sin(t*.68+b.userData.phase)*.055;b.rotation.z=Math.sin(t*.5+b.userData.phase)*.012;b.rotation.x=Math.cos(t*.43+b.userData.phase)*.008;});
    updateDeparture(t);
    animated.moorings.forEach((m,i)=>{
      const release=m.releases?Math.min(1,departureProgress(t)*28):0;
      m.material.opacity=.9*(1-release);m.group.visible=release<.98;
      if(!m.group.visible)return;
      const a=m.boat.localToWorld(m.local.clone()),b=m.shore;
      const mid=a.clone().lerp(b,.52);mid.y-=.18+(.5+.5*Math.sin(t*.72+m.phase))*.14;
      [[a,mid],[mid,b]].forEach((pair,k)=>{const seg=m.segments[k],d=pair[1].clone().sub(pair[0]),len=d.length();seg.position.copy(pair[0]).add(pair[1]).multiplyScalar(.5);seg.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());seg.scale.set(1,len,1);});
    });
    animated.fenders.forEach((f,i)=>{const q=t*.68+f.phase,bump=Math.max(0,(Math.sin(t*.29+f.phase)-.9)/.1);f.mesh.position.x=f.baseX+Math.sin(q*.73)*.025-bump*.055;f.mesh.position.y=f.baseY+Math.sin(t*.82+f.phase)*.045;f.mesh.rotation.z=Math.sin(q)*.08-bump*.055;});
    const wakeActive=departureProgress(t)>0;
    function wakeNear(o,r){return wakeActive?Math.max(0,1-Math.hypot(o.position.x-boatD.position.x,o.position.z-boatD.position.z)/r):0;}
    [boatA,boatB,boatC].forEach((b,i)=>{const w=wakeNear(b,3.5);b.position.y+=w*Math.sin(t*5.2+i)*.13;b.rotation.z+=w*Math.sin(t*4.6+i)*.05;});
    animated.buoys.forEach((b,i)=>{const w=wakeNear(b,5.4);b.position.y=b.userData.baseY+Math.sin(t*.75+b.userData.phase)*.025+w*Math.sin(t*6+b.userData.phase)*.18;b.rotation.z=Math.sin(t*.65+b.userData.phase)*.015+w*Math.sin(t*5.5+i)*.14;});
    animated.reflections.forEach((r,i)=>{const b=r.userData.boat;r.position.x=b.position.x;r.position.z=b.position.z;r.rotation.y=b.rotation.y;const q=t*.62+r.userData.phase;r.children.forEach((p,k)=>{p.scale.x=.78+.22*Math.sin(q+k*1.7);p.scale.y=.92+.12*Math.cos(q*.7+k);p.position.x=p.userData.baseX+Math.sin(q+k)*.035;});});
    animated.puddleReflections.forEach((r,i)=>{const q=t*.45+r.userData.phase;r.children.forEach((p,k)=>{p.scale.x=.84+.16*Math.sin(q+k*.9);p.position.x=p.userData.baseX+Math.sin(q*.8+k)*.025;p.material.opacity=.2+.14*(.5+.5*Math.sin(q+k));});});
    animated.puddleBirds.forEach((b,i)=>{const q=t*.34+b.userData.phase;b.position.x=b.userData.baseX+Math.sin(q)*.28;b.position.z=b.userData.baseZ+Math.cos(q*.7)*.12;b.userData.wing.scale.x=.78+.2*Math.sin(t*2.2);b.userData.wing.material.opacity=.16+.12*(.5+.5*Math.sin(q));});
    distantBoat.position.x=-10+((t*.42)%20);distantBoat.position.y=.3+Math.sin(t*.7)*.025;
    animated.seaweed.forEach((s,i)=>{s.rotation.z=(i%3-1)*.18+Math.sin(t*.8+i*.7)*.13;});
    animated.hangingRopes.forEach((r,i)=>{const sway=Math.sin(t*.55+r.userData.phase)*.018;r.rotation.y=r.userData.front?sway:0;r.rotation.z=r.userData.front?0:sway;});
    animated.fish.forEach((f,i)=>{const scatter=orbit.approach>0?1.8:1;f.position.x=-1+((t*f.userData.speed*scatter+i*2.9)%18);f.position.z=f.userData.baseZ+Math.sin(t*.55+i)*(.22*scatter);f.rotation.y=Math.sin(t*.4+i)*.08;});
    animated.flags.forEach((f,i)=>{const g=gustWave(t,.72+i*.13);f.rotation.y=Math.sin(t*1.2+i*.7)*(.05+g*.3);});
    animated.trees.forEach((tr,i)=>{const g=gustWave(t,2.0+i*.075);tr.rotation.z=Math.sin(t*.7+tr.userData.phase)*(.006+g*.055);});
    animated.ripples.forEach((r,i)=>{const k=.75+((t*.18+r.userData.phase)%1)*.65;r.scale.set(k,k,k);r.material.opacity=.5*(1-((t*.18+r.userData.phase)%1));});
    const dep=departureProgress(t),wallPulse=wakeActive?Math.exp(-Math.pow((dep-.27)/.09,2)):0,tetraPulse=wakeActive?Math.exp(-Math.pow((dep-.49)/.085,2)):0;
    animated.wakeSlaps.forEach((s,i)=>{s.visible=wallPulse>.025;s.scale.setScalar(.72+wallPulse*(.5+i*.025));s.material.opacity=wallPulse*(.3+.18*Math.sin(t*5+s.userData.phase));});
    animated.foam.forEach((f,i)=>{f.scale.x=.82+Math.sin(t*.8+f.userData.phase)*.18+tetraPulse*.32;f.material.opacity=.1+(.12+.2*Math.max(0,Math.sin(t*.7+f.userData.phase)))+tetraPulse*.28;});
    animated.caustics.forEach((c,i)=>{c.scale.x=.82+Math.sin(t*.65+c.userData.phase)*.18;c.material.opacity=.07+.09*(.5+.5*Math.sin(t*.5+c.userData.phase));});
    animated.mist.forEach((m,i)=>{m.position.x=m.userData.baseX+Math.sin(t*.055+m.userData.phase)*.75;m.material.opacity=.09+.06*(.5+.5*Math.sin(t*.04+m.userData.phase));});
    animated.drips.forEach((d,i)=>{const q=(t*.35+d.userData.phase*.13)%1;d.position.y=d.userData.baseY-q*d.userData.drop;d.visible=q<.72;});
    // Fish regroup after a camera approach.
    orbit.approach=Math.max(0,orbit.approach-dt);
    // Bird paths; the perched bird takes off when camera comes close.
    animated.gulls.forEach((g,i)=>{
      const u=g.userData;
      if(u.perched){
        if(orbit.approach<=0){g.position.copy(u.base);g.rotation.set(0,0,0);poseGullWings(u,0,1);return;}
        const f=exporting?Math.max(0,Math.min(1,(t-12.65)/1.55)):Math.max(0,Math.min(1,(2.2-orbit.approach)/1.6));
        const e=f*f*(3-2*f);g.position.copy(u.base).lerp(new THREE.Vector3(-2.4,3.5,-6.35),e);g.rotation.y=Math.atan2(camera.position.x-g.position.x,camera.position.z-g.position.z);poseGullWings(u,Math.sin(t*8)*(.12+.45*e),1-e);return;
      }
      const tt=t*.22+u.phase,rad=7+i,quietLift=exporting&&t>27.5&&t<49?5:0;
      const flight=new THREE.Vector3(2+Math.sin(tt)*rad,4.5+(i%2)*2+Math.sin(tt*2.2)*.7+quietLift,-3+Math.cos(tt)*rad*.65);
      if(!exporting&&u.landing){
        const q=(t+u.phase*3.7)%42,land=u.landing.boat?u.landing.boat.localToWorld(u.landing.local.clone()):u.landing.point;
        if(q>=29&&q<39){
          if(q<32)g.position.copy(flight).lerp(land,smooth((q-29)/3));else if(q<36)g.position.copy(land);else g.position.copy(land).lerp(flight,smooth((q-36)/3));
          const fold=q<32?smooth((q-29)/3):(q<36?1:1-smooth((q-36)/3));g.rotation.y=u.landing.yaw;poseGullWings(u,Math.sin(t*7+i)*.42,fold);return;
        }
      }
      g.position.copy(flight);g.rotation.y=tt+Math.PI/2;poseGullWings(u,Math.sin(t*5+i)*.35,0);
    });
    // Cat glances up when approached. In normal viewing, each sparse-rain outing takes one of three paths.
    const rainLevel=.58+.24*Math.sin(t*.12),catQ=((t%70)+70)%70;
    let catTravel=0,returning=false;if(!exporting){if(catQ>=25&&catQ<34)catTravel=smooth((catQ-25)/9);else if(catQ>=34&&catQ<44)catTravel=1;else if(catQ>=44&&catQ<51){catTravel=1-smooth((catQ-44)/7);returning=true;}}
    const routes=[[-3.2,.65],[-2.55,-1.15],[-3.75,-.3]],trip=((Math.floor(t/70)%routes.length)+routes.length)%routes.length,route=routes[trip]||routes[0];
    cat.position.x=cat.userData.baseX+route[0]*catTravel;cat.position.z=cat.userData.baseZ+route[1]*catTravel+Math.sin(catQ*.8)*.18*catTravel;cat.rotation.y=catTravel>0?(returning?0:Math.PI):0;catHead.rotation.z=orbit.approach>0?.32:0;
    cat.userData.paws.forEach((p,i)=>{p.rotation.z=catTravel>0?Math.sin(t*8+i*Math.PI/2)*.28:0;});
    // Passing cloud changes light, glints and the rare lighthouse flash.
    const cloudLight=.82+.18*(.5+.5*Math.sin(t*.055));sun.intensity=2.65+cloudLight*.75;hemi.intensity=2.0+cloudLight*.3;waterUniforms.cloud.value=cloudLight;rain.material.opacity=.25+rainLevel*.25;
    sunVisual.quaternion.copy(camera.quaternion);sunCoreMat.opacity=.52+cloudLight*.2;sunHaloMat.opacity=.07+cloudLight*.09;
    cloudShadowUniforms.time.value=t;cloudShadowUniforms.strength.value=Math.max(0,Math.min(1,(1-cloudLight)*7.5));
    animated.wetGlints.forEach(g=>{g.material.opacity=(.015+cloudLight*.08)*(.58+.42*Math.max(0,Math.sin(t*.35+g.userData.phase)));});
    animated.lightBeams.forEach(b=>{b.material.opacity=.018+cloudLight*(b.userData.cloudScale||.095);});
    const rareFlash=exporting?0:Math.max(0,(Math.sin(t*.045-1.2)-.982)/.018),tourFlash=exporting?Math.exp(-Math.pow((t-52.05)/.42,2)):0,beaconFlash=Math.min(1,Math.max(rareFlash,tourFlash));
    lighthouseObj.userData.glow.intensity=18*beaconFlash;lighthouseObj.userData.core.material.opacity=.08+.86*beaconFlash;lighthouseObj.userData.halo.material.opacity=.15*beaconFlash;
    clouds.children.forEach((c,i)=>{c.position.x=-48+((c.userData.baseX+48+t*c.userData.speed)%96);});
    // Rain falls in a deterministic loop and tilts farther during a gust.
    const p=rain.geometry.attributes.position.array,gust=windStrength(t);for(let i=0;i<rainCount;i++){const j=i*6;p[j+1]-=dt*(5.2+rainLevel*2);p[j+4]-=dt*(5.2+rainLevel*2);p[j]+=dt*gust*.9;p[j+3]+=dt*gust*.9;if(p[j+1]<-2){p[j+1]+=23;p[j+4]+=23;p[j]-=gust*2;p[j+3]-=gust*2;}}rain.geometry.attributes.position.needsUpdate=true;
    // Very faint posterized rainbow appears only during sparse rain; the tour times one arc for the wide opening.
    const naturalRainbow=Math.max(0,(.48-rainLevel)*.28),tourRainbow=exporting?.065*Math.exp(-Math.pow((t-4.1)/1.35,2)):0,rainbowOpacity=Math.max(naturalRainbow,tourRainbow);
    rainbow.children.forEach((band,i)=>{band.material.opacity=rainbowOpacity*(1-i*.045);});
  }
  function gustClock(t){return exporting ? ((t-23+42)%42) : (t%42);}
  function gustWave(t,delay){const q=gustClock(t)-delay;if(q<0||q>5.4)return 0;const s=Math.sin(q/5.4*Math.PI);return s*s;}
  function windStrength(t){return .08+gustWave(t,.45);}
  const rainbow=new THREE.Group();rainbow.position.set(-6,3,-28);scene.add(rainbow);
  [0xf2a6a0,0xf3c28d,0xeee09b,0xa9d5b8,0x9ecbd8].forEach((color,i)=>{const r=7.82+i*.18,band=new THREE.Mesh(new THREE.RingGeometry(r,r+.12,64,1,0,Math.PI),new THREE.MeshBasicMaterial({color,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false,fog:false}));band.renderOrder=-1;rainbow.add(band);});

  function renderLoop(now){requestAnimationFrame(renderLoop);if(!exporting){const dt=Math.min(.05,(now-last)/1000);last=now;update(sceneTime+dt,dt);}renderer.render(scene,camera);}
  requestAnimationFrame(renderLoop);
  addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

  // One-minute editorial camera: wide establishing view, harbor details, interiors,
  // underwater cross-section, beacon, and the departing boat. Cuts are intentional.
  const tourDuration=60;
  const tourShots=[
    {s:0,e:6,  p0:[34.5,31.4,37.8],p1:[27,21,31],t0:[0,0,0],t1:[0,1.2,-1]},
    {s:6,e:11, p0:[-1,7,16],p1:[8,6,13],t0:[1,1,-3],t1:[5,1,-5]},
    {s:11,e:15,p0:[-8,3.2,-7],p1:[-6.1,2.8,-8.1],t0:[-4.8,2.25,-9],t1:[-3.6,3.1,-7.8]},
    {s:15,e:19,p0:[8.5,5.8,15.5],p1:[3.8,4.0,13],t0:[2.5,2.05,9.2],t1:[-.4,2.35,6.7]},
    {s:19,e:23,p0:[14.2,2.8,15.4],p1:[12.8,2.2,14.2],t0:[10.8,1.6,12],t1:[10.3,1.7,12]},
    {s:23,e:28,p0:[-1,6.4,14.5],p1:[9.2,6.6,14.8],t0:[-6,2.4,8.4],t1:[12.7,3.8,8.7]},
    {s:28,e:33,p0:[6.2,2.7,-6.2],p1:[5.0,2.25,-5.3],t0:[3.2,1.45,-2.9],t1:[3.15,1.35,-3.0]},
    {s:33,e:39,p0:[-6.0,4.8,-.8],p1:[-11.5,4.4,-2.2],t0:[-11.5,2.2,-8.3],t1:[-11.5,1.9,-8.8]},
    {s:39,e:44,p0:[-12.3,4.4,8.5],p1:[-10.4,3.2,6.0],t0:[-11.2,2,1.1],t1:[-11.2,1.8,.3]},
    {s:44,e:49,p0:[19,-.35,7.5],p1:[17,-.7,-2.5],t0:[7,-.7,-2],t1:[3,-.9,-5]},
    {s:49,e:54,p0:[20,8.5,-2.5],p1:[19,7.2,-5.5],t0:[13.2,2.8,-13.6],t1:[13.2,2.9,-13.6]},
    {s:54,e:60,p0:[-7,9,4],p1:[-5,10,-5],t0:[12,-.2,-10],t1:[3,0,-14]}
  ];
  function smooth(u){return u*u*(3-2*u);}
  function tourCamera(t){
    let sh=tourShots[tourShots.length-1];for(const s of tourShots){if(t>=s.s&&t<s.e){sh=s;break;}}
    const u=smooth(Math.max(0,Math.min(1,(t-sh.s)/(sh.e-sh.s))));
    camera.position.lerpVectors(new THREE.Vector3().fromArray(sh.p0),new THREE.Vector3().fromArray(sh.p1),u);
    const target=new THREE.Vector3().lerpVectors(new THREE.Vector3().fromArray(sh.t0),new THREE.Vector3().fromArray(sh.t1),u);
    if(t>=54)target.copy(departureCurve.getPointAt(Math.max(0,departureProgress(t))));
    camera.lookAt(target);
    // Narrative reactions in their close-up windows.
    orbit.approach=(t>10.8&&t<15.2)||(t>18.7&&t<23.2)||(t>44&&t<48.8)?1.2:0;
  }
  window.videoExport={
    runs:['tour'],
    async begin(runId,options){
      if(runId!=='tour')throw new Error('Unknown run: '+runId);
      const fps=Number(options&&options.fps);if(!Number.isFinite(fps)||fps<=0)throw new Error('fps must be a positive number');
      exporting=true;this._fps=fps;this._lastFrame=-1;sceneTime=0;
      rain.geometry.attributes.position.array.set(rainInitial);rain.geometry.attributes.position.needsUpdate=true;
      boatD.position.copy(boatD.userData.home);boatD.rotation.y=boatD.userData.heading;
      tourCamera(0);update(0,0);renderer.render(scene,camera);
      await new Promise(resolve=>requestAnimationFrame(()=>{renderer.render(scene,camera);resolve();}));
      return {frames:Math.round(tourDuration*fps)};
    },
    async frame(i){
      if(!exporting)throw new Error('videoExport.begin() must be called first');
      const frame=Math.max(0,Math.min(Math.round(tourDuration*this._fps)-1,Math.floor(i))),t=frame/this._fps;
      // Sequential calls are specified; derive dt from frame numbers so 3 and 60 fps agree.
      const dt=this._lastFrame<0?0:(frame-this._lastFrame)/this._fps;this._lastFrame=frame;
      tourCamera(t);update(t,Math.max(0,dt));renderer.render(scene,camera);
      await new Promise(resolve=>requestAnimationFrame(()=>{renderer.render(scene,camera);resolve();}));
    },
    end(){exporting=false;last=performance.now();orbit.approach=0;applyOrbit();}
  };

  window.__harbor = { scene, camera, renderer, world, animated, waterUniforms, lighthouseObj, sun, hemi, clouds, boats:[boatA,boatB,boatC,boatD], orbit, update, tourCamera, get sceneTime(){return sceneTime;}, set exporting(v){exporting=v;} };
})();
