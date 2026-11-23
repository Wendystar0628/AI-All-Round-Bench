const TAU = Math.PI * 2,
  clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const config = {
  stiff: 0.52,
  tough: 0.78,
  mass: 4,
  height: 1.4,
  amp: 0.65,
  freq: 1.1,
  rho0: 0.55,
  rho1: 1,
  rho2: 1.8,
};
class Gel {
  constructor(kind, x, z, r, h, material) {
    Object.assign(this, { kind, x, z, r, h, material });
    this.N = 20;
    this.R = 2;
    this.L = 5;
    this.rest = [];
    this.tets = [];
    this.broken = false;
    this.fracture = 0;
    for (let l = 0; l <= this.L; l++) {
      this.rest.push(...this.point(0, 0, l / this.L));
      for (let k = 1; k <= 2; k++)
        for (let j = 0; j < this.N; j++)
          this.rest.push(...this.point(k / 2, (j * TAU) / this.N, l / this.L));
    }
    const id = (l, k, j) => this.id(l, k, j);
    for (let l = 0; l < this.L; l++)
      for (let j = 0; j < this.N; j++) {
        let v = [
          [id(l, 0, j), id(l, 1, j), id(l, 1, j + 1)],
          [id(l, 1, j), id(l, 2, j), id(l, 2, j + 1)],
          [id(l, 1, j), id(l, 2, j + 1), id(l, 1, j + 1)],
        ];
        for (let tri of v) {
          tri.sort((a, b) => a - b);
          let [a, b, c] = tri,
            d = a + 41,
            e = b + 41,
            f = c + 41;
          this.tets.push([a, b, c, f], [a, b, e, f], [a, d, e, f]);
        }
      }
    this.p = Float64Array.from(this.rest);
    this.v = new Float64Array(this.p.length);
    this.prev = this.p.slice();
    this.buildConstraints();
    this.buildSkin();
    this.update();
  }
  id(l, k, j) {
    return l * 41 + (k ? 1 + (k - 1) * this.N + (j % this.N) : 0);
  }
  point(k, a, t) {
    let c = Math.cos(a),
      s = Math.sin(a),
      shape =
        this.kind == 0
          ? 1.03 - 0.19 * t + 0.035 * Math.sin(Math.PI * t)
          : this.kind == 1
            ? 0.99 / Math.pow(Math.pow(c, 6) + Math.pow(s, 6), 1 / 6)
            : Math.sqrt(Math.max(0.03, 1 - 0.88 * t * t));
    let bevel = 1 - 0.085 * Math.exp(-t * 24) - 0.095 * Math.exp((t - 1) * 22);
    let ripple =
      this.kind == 0
        ? 1 + 0.077 * Math.cos(12 * a)
        : this.kind == 2
          ? 1 + 0.026 * Math.cos(14 * a)
          : 1;
    return [
      this.x + this.r * k * c * shape * bevel * ripple,
      0.045 + this.h * (t + 0.045 * (1 - k * k) * t * t),
      this.z + this.r * k * s * shape * bevel * ripple,
    ];
  }
  buildConstraints() {
    let edges = new Map();
    this.vols = [];
    for (let tet of this.tets) {
      let ids = tet.map((i) => i * 3);
      this.vols.push([...ids, this.volume(ids, this.rest)]);
      for (let k = 0; k < 4; k++)
        for (let j = k + 1; j < 4; j++) {
          let a = Math.min(ids[k], ids[j]),
            b = Math.max(ids[k], ids[j]),
            key = a + ',' + b;
          if (!edges.has(key))
            edges.set(key, [
              a,
              b,
              Math.hypot(...[0, 1, 2].map((s) => this.rest[a + s] - this.rest[b + s])),
            ]);
        }
    }
    this.edges = [...edges.values()];
    this.edgeLambda = new Float64Array(this.edges.length);
    this.volumeLambda = new Float64Array(this.vols.length);
    this.grad = new Float64Array(12);
  }
  volume([a, b, c, d], p) {
    let bx = p[b] - p[a],
      by = p[b + 1] - p[a + 1],
      bz = p[b + 2] - p[a + 2],
      cx = p[c] - p[a],
      cy = p[c + 1] - p[a + 1],
      cz = p[c + 2] - p[a + 2],
      dx = p[d] - p[a],
      dy = p[d + 1] - p[a + 1],
      dz = p[d + 2] - p[a + 2];
    return bx * (cy * dz - cz * dy) + by * (cz * dx - cx * dz) + bz * (cx * dy - cy * dx);
  }
  buildSkin() {
    let p = [],
      idx = [],
      weights = [];
    let profile = [];
    for (let k = 0; k <= 8; k++) profile.push([k / 8, 0]);
    for (let t = 1; t <= 28; t++) profile.push([1, t / 28]);
    for (let k = 11; k >= 0; k--) profile.push([k / 12, 1]);
    const seg = 120;
    profile.forEach(([k, t], i) => {
      for (let j = 0; j < seg; j++) {
        let a = (j * TAU) / seg;
        p.push(...this.point(k, a, t));
        let w = [];
        let l = Math.min(4, Math.floor(t * 5)),
          kk = Math.min(1, Math.floor(k * 2)),
          n = Math.floor(j / 6);
        for (let u = 0; u < 2; u++)
          for (let s = 0; s < 2; s++)
            for (let b = 0; b < 2; b++)
              w.push([
                this.id(l + u, kk + s, n + b) * 3,
                (u ? t * 5 - l : 1 - t * 5 + l) *
                  (s ? k * 2 - kk : 1 - k * 2 + kk) *
                  (b ? j / 6 - n : 1 - j / 6 + n),
              ]);
        weights.push(w);
        if (i) {
          let a = (i - 1) * seg + j,
            b = (i - 1) * seg + ((j + 1) % seg),
            c = a + seg,
            d = b + seg;
          idx.push(a, c, b, b, c, d);
        }
      }
    });
    this.base = p;
    this.weights = weights;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    world.add(this.mesh);
  }
  split(impact, intensity = 2, contactZ = this.z) {
    if (this.broken) return;
    this.broken = true;
    this.crackFront = 0.1;
    this.crackLimit = clamp(0.18 + (intensity - 1) * 2.35, 0.18, 1.75);
    this.ties = [];
    // Orient the opening across the principal tensile direction around the contact.
    let xx = 0.002,
      xz = 0,
      zz = 0;
    for (const [a, b, length] of this.edges) {
      const dx = this.p[b] - this.p[a],
        dy = this.p[b + 1] - this.p[a + 1],
        dz = this.p[b + 2] - this.p[a + 2];
      const stretch = Math.max(0, Math.hypot(dx, dy, dz) / length - 1);
      const distance = (this.p[a] - impact) ** 2 + (this.p[a + 2] - contactZ) ** 2;
      const weight = (stretch * Math.exp(-distance / (this.r * this.r))) / (length * length);
      xx += weight * dx * dx;
      xz += weight * dx * dz;
      zz += weight * dz * dz;
    }
    const angle = Math.atan2(2 * xz, xx - zz) / 2;
    const nx = Math.cos(angle),
      nz = Math.sin(angle);
    const oldIndex=[];
    const bulk=1+(this.compression||0), breadth=1/Math.sqrt(bulk);
    for(let i=0;i<this.p.length;i+=3){
      const y=this.p[i+1];
      this.p[i]=this.x+(this.p[i]-this.x)*breadth+(this.shear||0)*y/this.h;
      this.p[i+1]*=bulk;
      this.p[i+2]=this.z+(this.p[i+2]-this.z)*breadth;
      this.v[i+1]=this.v[i+1]*bulk+(this.impulse||0)*y;
    }
    this.compression=this.impulse=this.shear=this.shearV=0;
    let mapping = new Map(),
      np = [],
      nr = [],
      nv = [],
      cut = this.x + clamp(impact - this.x, -0.35, 0.35);
    this.tets = this.tets.map((t) => {
      let x = 0,
        z = 0;
      for (let n of t) {
        x += this.rest[n * 3] / 4;
        z += (this.rest[n * 3 + 2] - this.z) / 4;
      }
      let side = nx * (x - cut) + nz * (z + this.z - contactZ) > 0 ? 1 : -1;
      return t.map((n) => {
        let key = n + ',' + side;
        if (!mapping.has(key)) {
          mapping.set(key, np.length / 3);oldIndex.push(n);
          for (let d = 0; d < 3; d++) {
            nr.push(this.rest[n * 3 + d]);
            const normal = d === 0 ? nx : d === 2 ? nz : 0;
            np.push(this.p[n * 3 + d] + 0.015 * normal * side);
            nv.push(this.v[n * 3 + d] + (d === 1 ? 0.7 : 1.8 * normal * side));
          }
        }
        return mapping.get(key);
      });
    });
    for (let [key, n] of mapping) {
      let [old, side] = key.split(',');
      if (side != '1') continue;
      let m = mapping.get(old + ',-1');
      if (m === undefined) continue;
      let o = Number(old) * 3,
        depth = Math.max(0, 1 - this.rest[o + 1] / this.h),
        radius = Math.hypot(this.rest[o] - impact, this.rest[o + 2] - contactZ) / this.r;
      this.ties.push([3 * n, 3 * m, depth + 0.49 * radius]);
    }
    this.groups = new Int8Array(np.length / 3);
    for (let [key, n] of mapping) this.groups[n] = +key.split(',')[1];
    this.p = Float64Array.from(np);
    this.prev = this.p.slice();
    this.rest = nr;
    this.v = Float64Array.from(nv);
    this.buildConstraints();
    let faces = new Map();
    for (let t of this.tets) {
      for (let i = 0; i < 4; i++) {
        let f = t.filter((_, j) => i != j),
          key = [...f].sort((a, b) => a - b).join(',');
        if (faces.has(key)) faces.delete(key);
        else {
          if (
            this.volume(
              [...f, t[i]].map((j) => j * 3),
              nr,
            ) > 0
          )
            f.reverse();
          faces.set(key, {tri:f,tet:t});
        }
      }
    }
    this.geo.dispose();
    this.geo = new THREE.BufferGeometry();
    // Subdivide the newly exposed tetrahedral boundary. Bind every detailed point
    // back to the deforming tetrahedron so the molded ridges rotate with the fragments.
    this.fractureBindings=[];
    const cache=new Map(), indices=[[],[]];
    const seam=new Set(this.ties.flatMap(pair=>[pair[0]/3,pair[1]/3]));
    const restAt=n=>new THREE.Vector3().fromArray(nr,n*3);
    const tetFrame=tet=>{
      const origin=restAt(tet[0]);
      const [u,v,w]=tet.slice(1).map(n=>restAt(n).sub(origin));
      const inv=new THREE.Matrix3().set(u.x,v.x,w.x,u.y,v.y,w.y,u.z,v.z,w.z).invert();
      return point=>{const q=point.clone().sub(origin).applyMatrix3(inv);return [1-q.x-q.y-q.z,q.x,q.y,q.z]};
    };
    for(const {tri,tet} of faces.values()){
      const material=tri.every(n=>seam.has(n))?1:0;
      const bind=tetFrame(tet);
      const uvw=tri.map(n=>{
        const id=oldIndex[n],ring=id%41,angle=(ring-1)%20*TAU/20;
        const r=ring===0?0:ring<=20?.5:1;
        return [r,Math.cos(angle)*r,Math.sin(angle)*r,Math.floor(id/41)/5];
      });
      const subdivisions=5, rows=[];
      for(let i=0;i<=subdivisions;i++){
        const row=[];rows.push(row);
        for(let j=0;j<=subdivisions-i;j++){
          const weights=[subdivisions-i-j,i,j];
          const tag=material+'|'+tri.map((n,k)=>weights[k]?n+':'+weights[k]:'').filter(Boolean).sort().join('/');
          let index=cache.get(tag);
          if(index===undefined){
            const interp=c=>weights.reduce((sum,wt,k)=>sum+uvw[k][c]*wt/subdivisions,0);
            const point=new THREE.Vector3(...this.point(interp(0),Math.atan2(interp(2),interp(1)),interp(3)));
            if(material===1){
              // The wet fracture face follows its tetrahedron. Only its boundary
              // inherits the curvature of the original mold.
              let edgeBlend=0;
              for(let a=0;a<3;a++){
                const u=uvw[(a+1)%3],v=uvw[(a+2)%3];
                if((u[0]===1&&v[0]===1)||(u[3]===v[3]&&(u[3]===0||u[3]===1)))
                  edgeBlend=Math.max(edgeBlend,(1-weights[a]/subdivisions)**3);
              }
              const planar=new THREE.Vector3();
              tri.forEach((n,j)=>planar.addScaledVector(restAt(n),weights[j]/subdivisions));
              point.lerp(planar,1-edgeBlend);
            }
            index=this.fractureBindings.length;
            this.fractureBindings.push({nodes:tet,weights:bind(point)});
            cache.set(tag,index);
          }
          row.push(index);
        }
      }
      for(let i=0;i<subdivisions;i++)for(let j=0;j<subdivisions-i;j++){
        indices[material].push(rows[i][j],rows[i+1][j],rows[i][j+1]);
        if(j+1<subdivisions-i)indices[material].push(rows[i+1][j],rows[i+1][j+1],rows[i][j+1]);
      }
    }
    this.geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(this.fractureBindings.length*3),3));
    this.geo.setIndex(indices[0].concat(indices[1]));
    this.geo.addGroup(0,indices[0].length,0);
    this.geo.addGroup(indices[0].length,indices[1].length,1);
    for(const seed of this.seeds||[]){
      const side=nx*(seed.base[0]-cut)+nz*(seed.base[2]-contactZ)>0?1:-1;
      const n=mapping.get(seed.ix/3+','+side)??mapping.get(seed.ix/3+','+(-side));
      const tet=this.tets.find(t=>t.includes(n));
      seed.binding={nodes:tet,weights:tetFrame(tet)(new THREE.Vector3(...seed.base))};
    }
    let wet = this.material.clone();
    wet.roughness = 0.28;
    wet.color.lerp(new THREE.Color('#edb9ff'), 0.32);
    wet.transmission = 0.4;
    this.mesh.material = [this.material, wet];
    this.mesh.geometry = this.geo;
  }
  step(dt, balls) {
    let p = this.p,
      v = this.v,
      q = this.prev,
      stiff = clamp(config.stiff * (this.kind == 1 ? 1.45 : this.kind == 2 ? 0.85 : 1), 0.05, 1);
    if (this.broken) this.crackFront = Math.min(this.crackLimit, this.crackFront + dt * 8);
    q.set(p);
    for (let i = 0; i < p.length; i += 3) {
      v[i + 1] -= 4 * dt;
      for (let j = 0; j < 3; j++) p[i + j] += v[i + j] * dt;
    }
    let sc = this.broken ? 1 : 1 + (this.compression || 0),
      rad = 1 / Math.sqrt(sc);
    let local = balls.map((b) => ({
      x: this.x + (b.x - this.x - ((this.shear || 0) * b.y) / this.h) / rad,
      y: b.y / sc,
      z: this.z + (b.z - this.z) / rad,
      r: b.r,
      sc,
      rad,
    }));
    this.edgeLambda.fill(0);
    this.volumeLambda.fill(0);
    const edgeAlpha = (0.00003 + 0.00032 * (1 - stiff)) / (dt * dt);
    const volumeAlpha = 0.000000012 / (dt * dt);
    for (let it = 0; it < 3; it++) {
      for (let n = 0; n < this.edges.length; n++) {
        const [a, b, rest] = this.edges[n];
        let x = p[b] - p[a],
          y = p[b + 1] - p[a + 1],
          z = p[b + 2] - p[a + 2],
          len = Math.sqrt(x * x + y * y + z * z) || 1,
          delta = (rest - len - edgeAlpha * this.edgeLambda[n]) / (2 + edgeAlpha),
          f = -delta / len;
        this.edgeLambda[n] += delta;
        p[a] += x * f;
        p[b] -= x * f;
        p[a + 1] += y * f;
        p[b + 1] -= y * f;
        p[a + 2] += z * f;
        p[b + 2] -= z * f;
      }
      if (this.broken) {
        for (let [a, b, depth] of this.ties) {
          if (depth < this.crackFront) continue;
          for (let j = 0; j < 3; j++) {
            let f = (p[b + j] - p[a + j]) * 0.49;
            p[a + j] += f;
            p[b + j] -= f;
          }
        }
      }
      let g = this.grad;
      for (let n = 0; n < this.vols.length; n++) {
        const e = this.vols[n];
        let [a, b, c, d, target] = e;
        for (let j = 0; j < 3; j++) {
          let k = (j + 1) % 3,
            h = (j + 2) % 3;
          g[j + 3] =
            (p[c + k] - p[a + k]) * (p[d + h] - p[a + h]) -
            (p[c + h] - p[a + h]) * (p[d + k] - p[a + k]);
          g[j + 6] =
            (p[d + k] - p[a + k]) * (p[b + h] - p[a + h]) -
            (p[d + h] - p[a + h]) * (p[b + k] - p[a + k]);
          g[j + 9] =
            (p[b + k] - p[a + k]) * (p[c + h] - p[a + h]) -
            (p[b + h] - p[a + h]) * (p[c + k] - p[a + k]);
          g[j] = -g[3 + j] - g[6 + j] - g[9 + j];
        }
        let norm = 1e-6;
        for (let j = 0; j < 12; j++) norm += g[j] * g[j];
        let f =
          (target - this.volume(e, p) - volumeAlpha * this.volumeLambda[n]) / (norm + volumeAlpha);
        this.volumeLambda[n] += f;
        for (let j = 0; j < 12; j++) p[e[(j / 3) | 0] + (j % 3)] += g[j] * f;
      }
      for (let i = 0; i < p.length; i += 3) {
        if (p[i + 1] < 0.035) {
          p[i + 1] = 0.035;
          p[i] = q[i] + (p[i] - q[i]) * 0.86;
          p[i + 2] = q[i + 2] + (p[i + 2] - q[i + 2]) * 0.86;
        }
        p[i] = clamp(p[i], -4.52, 4.52);
        p[i + 2] = clamp(p[i + 2], -2.42, 2.42);
        for (let b of local) {
          let x = p[i] - b.x,
            y = p[i + 1] - b.y,
            z = p[i + 2] - b.z,
            r2 = (x * x + z * z) * rad * rad + y * y * sc * sc;
          if (r2 < b.r * b.r && r2 > 1e-8) {
            let f = b.r / Math.sqrt(r2) - 1;
            p[i] += x * f;
            p[i + 1] += y * f;
            p[i + 2] += z * f;
          }
        }
      }
    }
    for (let i = 0; i < p.length; i++) v[i] = clamp(((p[i] - q[i]) / dt) * 0.986, -9, 9);
  }
  update() {
    let a = this.geo.attributes.position.array;
    if (this.broken) {
      for(let i=0;i<this.fractureBindings.length;i++){
        const {nodes,weights}=this.fractureBindings[i];
        for(let axis=0;axis<3;axis++){
          let value=0;for(let k=0;k<4;k++)value+=weights[k]*this.p[nodes[k]*3+axis];
          a[i*3+axis]=value;
        }
      }
    }
    else {
      for (let i = 0; i < this.weights.length; i++) {
        let x = 0,
          y = 0,
          z = 0;
        for (let [n, w] of this.weights[i]) {
          x += (this.p[n] - this.rest[n]) * w;
          y += (this.p[n + 1] - this.rest[n + 1]) * w;
          z += (this.p[n + 2] - this.rest[n + 2]) * w;
        }
        a[3 * i] = this.base[3 * i] + x;
        a[3 * i + 1] = this.base[3 * i + 1] + y;
        a[3 * i + 2] = this.base[3 * i + 2] + z;
        let scale = 1 + (this.compression || 0),
          radial = 1 / Math.sqrt(scale);
        a[3 * i] =
          this.x + (a[3 * i] - this.x) * radial + (this.shear || 0) * (a[3 * i + 1] / this.h);
        a[3 * i + 2] = this.z + (a[3 * i + 2] - this.z) * radial;
        a[3 * i + 1] *= scale;
      }
    }
    if (!this.broken && typeof balls != 'undefined') {
      for (let b of balls) {
        if (b.held || Math.abs(b.x - this.x) > this.r + 1) continue;
        let indent = clamp(this.h * (1 + (this.compression || 0)) + b.r - b.y, 0, 0.8);
        if (indent <= 0) continue;
        for (let i = 0; i < a.length; i += 3) {
          let upper = clamp((this.base[i + 1] / this.h - 0.6) / 0.4, 0, 1);
          if (!upper) continue;
          let dx = a[i] - b.x,
            dz = a[i + 2] - b.z,
            rr = Math.sqrt(dx * dx + dz * dz),
            rim = Math.exp(-Math.pow((rr / b.r - 0.98) / 0.37, 2));
          a[i + 1] += indent * 0.78 * rim * upper;
          if (rr < b.r && a[i + 1] < b.y)
            a[i + 1] = Math.min(a[i + 1], b.y - Math.sqrt(b.r * b.r - rr * rr) + 0.006);
        }
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }
}
