/* Triangulate an isodensity surface of the three-dimensional particle cloud.
   Mirrored samples at the glass keep the contact surface continuous. */
class LiquidSkin {
  constructor() {
    this.nx = 60;
    this.nz = 24;
    this.ny = 29;
    this.pitch = 0.147;
    this.sx = FL / (this.nx - 3);
    this.sz = FW / (this.nz - 3);
    let n = this.nx * this.ny * this.nz;
    this.field = new Float32Array(n);
    this.temp = new Float32Array(n);
    this.grad = new Float32Array(n * 3);
    this.pos = new Float32Array(900000);
    this.norm = new Float32Array(900000);
    this.aeration = new Float32Array(300000);
    this.foamField = new Float32Array(n);
    this.geometry = new THREE.BufferGeometry();
    for (let [name, arr] of [
      ['position', this.pos],
      ['normal', this.norm],
    ])
      this.geometry.setAttribute(
        name,
        new THREE.BufferAttribute(arr, 3).setUsage(THREE.DynamicDrawUsage),
      );
    this.geometry.setAttribute('aeration',new THREE.BufferAttribute(this.aeration,1).setUsage(THREE.DynamicDrawUsage));
    this.indices = [
      [0, 1, 3, 7],
      [0, 3, 2, 7],
      [0, 2, 6, 7],
      [0, 6, 4, 7],
      [0, 4, 5, 7],
      [0, 5, 1, 7],
    ];
    this.off = [
      0,
      1,
      this.nx,
      this.nx + 1,
      this.nx * this.ny,
      this.nx * this.ny + 1,
      this.nx * this.ny + this.nx,
      this.nx * this.ny + this.nx + 1,
    ];
    this.mesh = mesh(
      this.geometry,
      new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.FrontSide,
        depthWrite: false,
        uniforms: {
          studio: { value: env },
          behind: { value: null },
          sceneDepth: {value:null},nearFar:{value:new THREE.Vector2(cam.near,cam.far)},
          pixels: { value: new THREE.Vector2(1, 1) },
        },
        vertexShader: `
attribute float aeration;
varying vec3 wp,wn; varying float foamDensity,eyeZ;
void main(){
  wp=(modelMatrix*vec4(position,1.)).xyz;wn=normal;foamDensity=aeration;
  vec4 eye=viewMatrix*vec4(wp,1.);eyeZ=-eye.z;gl_Position=projectionMatrix*eye;
}`,
        fragmentShader: `
varying vec3 wp,wn;varying float foamDensity,eyeZ;
uniform sampler2D studio,behind,sceneDepth;uniform vec2 pixels,nearFar;
float linearDepth(float d){return nearFar.x*nearFar.y/(nearFar.y-d*(nearFar.y-nearFar.x));}
float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float cell(vec3 p){vec3 i=floor(p),f=fract(p);float d=1.;
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
    vec3 k=vec3(float(x),float(y),0.);vec2 seed=vec2(hash(i+k),hash(i+k+13.4));
    d=min(d,length(k.xy+.15+.7*seed-f.xy));
  }return d;
}
void main(){
  vec3 N=normalize(wn),V=normalize(cameraPosition-wp),R=reflect(-V,N);
  float fr=.023+.977*pow(1.-clamp(dot(N,V),0.,1.),5.);
  vec2 uv=vec2(atan(R.z,R.x)*.15915494+.5,asin(R.y)*.31830989+.5);
  vec3 sky=texture2D(studio,uv).rgb;
  vec2 screen=gl_FragCoord.xy/pixels;
  float depthHere=linearDepth(texture2D(sceneDepth,screen).r);
  float path=clamp(depthHere-eyeZ,0.,2.8);
  vec2 shift=(mat3(viewMatrix)*N).xy*.017*min(1.,path);
  vec2 bent=clamp(screen+shift,.001,.999);
  if(linearDepth(texture2D(sceneDepth,bent).r)<eyeZ+.025)bent=screen;
  vec3 through=texture2D(behind,bent).rgb;
  vec3 trans=exp(-vec3(.38,.145,.095)*path);
  vec3 col=mix(vec3(.038,.26,.30),through,trans);
  float top=smoothstep(-.04,.66,N.y);
  float spec=pow(max(0.,dot(reflect(-normalize(vec3(-.7,1.,.1)),N),V)),75.);
  col=mix(col,sky,fr*.85+.085*top)+sky*sky*.12*top+spec*.54+top*vec3(.005,.025,.031);
  if(foamDensity>.02 && abs(wp.z)<1.565 && wp.x<4.255){
    float pores=cell(vec3((wp.x+wp.y*.47)*21.,(wp.z+wp.y*.63)*26.,0.));
    float film=smoothstep(.12,1.35,foamDensity)*(.58+.30*smoothstep(.16,.41,pores));
    col=mix(col,vec3(.78,.91,.90),film);
  }
  gl_FragColor=vec4(col,.985);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
      }),
      0,
      0,
      0,
      tank,
    );
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.renderOrder = 2;
  }
  rebuild(w) {
    let { nx, ny, nz, pitch, field: f, temp: t, grad: g, sx, sz } = this,
      nxy = nx * ny;
    this.foamField.fill(0);
    for(const trace of foam){
      const x=(trace.x+FL/2)/sx+1,y=trace.y/pitch,z=(trace.z+FW/2)/sz+1;
      for(let k=Math.max(0,(z|0)-2);k<=Math.min(nz-1,(z|0)+2);k++)
        for(let j=Math.max(0,(y|0)-2);j<=Math.min(ny-1,(y|0)+2);j++)
          for(let i=Math.max(0,(x|0)-2);i<=Math.min(nx-1,(x|0)+2);i++){
            const r2=(i-x)**2+(k-z)**2+(j-y)**2*.65;
            if(r2<3.2)this.foamField[i+j*nx+k*nxy]+=.18*(1-r2/3.2)*Math.min(1,trace.life*2.8);
          }
    }
    f.fill(0);
    let p = w.state;
    for (let i = 0; i < p.length; i += 8) {
      let X = p[i] / sx + 1,
        Y = p[i + 1] / pitch,
        Z = p[i + 2] / sz + 1,
        x = X | 0,
        y = Y | 0,
        z = Z | 0,
        fx = X - x,
        fy = Y - y,
        fz = Z - z;
      if (y >= ny - 1) continue;
      let j = x + y * nx + z * nxy;
      for (let k = 0; k < 8; k++)
        f[j + this.off[k]] += (k & 1 ? fx : 1 - fx) * (k & 2 ? fy : 1 - fy) * (k & 4 ? fz : 1 - fz);
    }
    for (let step of [1, nx, nxy, 1, nxy]) {
      for (let j = 0; j < f.length; j++)
        t[j] = 0.48 * f[j] + 0.26 * ((f[j - step] || 0) + (f[j + step] || 0));
      f.set(t);
    }
    // A one-cell ghost band gives the walls exactly planar wet faces.
    const iso = 0.42;
    let left = 1 + Math.floor(w.piston / sx);
    for (let z = 0; z < nz; z++)
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++) {
          let j = x + y * nx + z * nxy;
          if (x < left || x == nx - 1 || z == 0 || z == nz - 1) {
            f[j] = 0;
            continue;
          }
          if (x == left || x == nx - 2 || z == 1 || z == nz - 2) {
            let xx = clamp(x, left + 1, nx - 3),
              zz = clamp(z, 2, nz - 3);
            f[j] = f[xx + y * nx + zz * nxy];
          }
        }
    for (let j = nxy; j < f.length - nxy; j++) {
      g[j * 3] = f[j - 1] - f[j + 1];
      g[j * 3 + 1] = f[j - nx] - f[j + nx];
      g[j * 3 + 2] = f[j - nxy] - f[j + nxy];
    }
    let ptr = 0,
      po = this.pos,
      no = this.norm,
      d = this.off,
      tets = this.indices;
    for (let z = 0; z < nz - 1; z++)
      for (let y = 0; y < ny - 1; y++)
        for (let x = left - 1; x < nx - 1; x++) {
          let j = x + nx * y + nxy * z,
            mask = 0;
          for (let k = 0; k < 8; k++) if (f[j + d[k]] > iso) mask |= 1 << k;
          if (mask == 0 || mask == 255) continue;
          const emit = (a, b) => {
            let ia = j + d[a],
              ib = j + d[b],
              r = (iso - f[ia]) / (f[ib] - f[ia]),
              u = 1 - r;
            let X = (x - 1 + (a & 1) * u + (b & 1) * r) * sx,
              Z = (z - 1 + ((a >> 2) & 1) * u + ((b >> 2) & 1) * r) * sz;
            po[ptr] = clamp(X, w.piston, FL) - FL / 2;
            po[ptr + 1] = (y + ((a >> 1) & 1) * u + ((b >> 1) & 1) * r) * pitch;
            po[ptr + 2] = clamp(Z, 0, FW) - FW / 2;
            for (let c = 0; c < 3; c++) no[ptr + c] = g[ia * 3 + c] * u + g[ib * 3 + c] * r;
            if (X <= w.piston + 0.001 || X >= FL - 0.001 || Z <= 0 || Z >= FW) {
              no[ptr] = X <= w.piston + 0.001 ? -1 : X >= FL - 0.001 ? 1 : 0;
              no[ptr + 1] = 0.025;
              no[ptr + 2] = Z <= 0 ? -1 : Z >= FW ? 1 : 0;
            }
            this.aeration[ptr/3]=this.foamField[ia]*u+this.foamField[ib]*r;
            ptr += 3;
          };
          for (let tet of tets) {
            let hi = [],
              lo = [];
            for (let k of tet) (mask & (1 << k) ? hi : lo).push(k);
            if (!hi.length || !lo.length) continue;
            if (hi.length == 2) {
              emit(hi[0], lo[0]);
              emit(hi[0], lo[1]);
              emit(hi[1], lo[0]);
              emit(hi[1], lo[0]);
              emit(hi[0], lo[1]);
              emit(hi[1], lo[1]);
            } else {
              let a = hi.length == 1 ? hi : lo,
                b = hi.length == 1 ? lo : hi;
              emit(a[0], b[0]);
              emit(a[0], b[1]);
              emit(a[0], b[2]);
            }
          }
        }
    // Orient every triangle toward decreasing density, including detached sheets.
    for (let i = 0; i < ptr; i += 9) {
      let ux = po[i + 3] - po[i],
        uy = po[i + 4] - po[i + 1],
        uz = po[i + 5] - po[i + 2],
        vx = po[i + 6] - po[i],
        vy = po[i + 7] - po[i + 1],
        vz = po[i + 8] - po[i + 2];
      if (
        (uy * vz - uz * vy) * (no[i] + no[i + 3] + no[i + 6]) +
          (uz * vx - ux * vz) * (no[i + 1] + no[i + 4] + no[i + 7]) +
          (ux * vy - uy * vx) * (no[i + 2] + no[i + 5] + no[i + 8]) <
        0
      ) {
        const k=i/3+1,tmp=this.aeration[k];this.aeration[k]=this.aeration[k+1];this.aeration[k+1]=tmp;
        for (let j = 0; j < 3; j++) {
          let t = po[i + 3 + j];
          po[i + 3 + j] = po[i + 6 + j];
          po[i + 6 + j] = t;
          t = no[i + 3 + j];
          no[i + 3 + j] = no[i + 6 + j];
          no[i + 6 + j] = t;
        }
      }
    }
    this.geometry.setDrawRange(0, ptr / 3);
    for (let a of Object.values(this.geometry.attributes)) {
      a.needsUpdate = true;
      a.clearUpdateRanges();
      a.addUpdateRange(0,ptr/3*a.itemSize);
    }
  }
}
const skin = new LiquidSkin();
skin.mesh.visible = false;

const refractionTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
refractionTarget.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
function captureRefraction() {
  let u = skin.mesh.material.uniforms;
  renderer.getDrawingBufferSize(u.pixels.value);
  let tw = Math.max(1, Math.round(u.pixels.value.x * 0.76)),
    th = Math.max(1, Math.round(u.pixels.value.y * 0.76));
  if (refractionTarget.width != tw || refractionTarget.height != th) refractionTarget.setSize(tw, th);
  skin.mesh.visible = false;
  glass.visible = false;
  renderer.setRenderTarget(refractionTarget);
  renderer.render(world, cam);
  renderer.setRenderTarget(null);
  glass.visible = true;
  skin.mesh.visible = true;
  u.behind.value = refractionTarget.texture;u.sceneDepth.value=refractionTarget.depthTexture;
}
