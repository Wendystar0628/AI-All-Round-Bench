const deviceScenes = new Map(),
  renders = new WeakMap();
let renderer;
function gfx() {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.addEventListener("webglcontextlost", (e) =>
      e.preventDefault(),
    );
    renderer.domElement.addEventListener("webglcontextrestored", () => {
      deviceScenes.clear();
      renderer = null;
      document
        .querySelectorAll(".viewport")
        .forEach((c) => delete c.dataset.frame);
    });
  }
  return renderer;
}
function createGpu(res) {
  let scene = new THREE.Scene();
  scene.background = new THREE.Color(res.sky || "#bccac6");
  scene.fog = new THREE.FogExp2(res.sky || "#bccac6", 1 / (res.fog || 160));
  let washCenter={value:new THREE.Vector3()},washPower={value:0};
  let objects = Object.create(null),
    pick = [],
    mats = new Map(),
    geo = new Map();
  scene.add(new THREE.HemisphereLight(0xffeed9, 0x6b8376, 2.3));
  let sun = new THREE.DirectionalLight(0xffedc4, 2.9);
  sun.position.fromArray(res.light || [10, 30, 15]);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -35,
    right: 35,
    top: 35,
    bottom: -35,
    far: 140,
  });
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  for (let n of res.nodes) {
    let obj,
      geom,
      mat,
      key = n.shape,
      sz = n.size || [1, 1, 1];
    if (key === "group") obj = new THREE.Group();
    else {
      if (!geo.has(key) || ["rod", "ring", "mesh", "grass"].includes(key)) {
        switch (key) {
          case "terrain":{
            geom=new THREE.PlaneGeometry(sz[0],sz[2],160,160);geom.rotateX(-Math.PI/2);
            const pos=geom.attributes.position;
            for(let i=0;i<pos.count;i++)pos.setY(i,sz[1]/2+terrainRelief(n,pos.getX(i)+n.p[0],pos.getZ(i)+n.p[2]));
            geom.computeVertexNormals();break;
          }
          case "mesh":
            geom = new THREE.BufferGeometry();
            geom.setAttribute(
              "position",
              new THREE.Float32BufferAttribute(n.verts, 3),
            );
            geom.computeVertexNormals();
            break;
          case "grass": {
            let verts = [];
            for (let [x, y, z, h, a] of n.instances) {
              let dx = Math.cos(a) * h * 0.18,
                dz = Math.sin(a) * h * 0.18;
              for (let i = -1; i <= 1; i++)
                verts.push(
                  x - dx,
                  y,
                  z - dz,
                  x + dx,
                  y,
                  z + dz,
                  x + dx * i * 3,
                  y + h * (1 - 0.16 * Math.abs(i)),
                  z + dz * i * 3,
                );
            }
            geom = new THREE.BufferGeometry();
            geom.setAttribute(
              "position",
              new THREE.Float32BufferAttribute(verts, 3),
            );
            geom.computeVertexNormals();
            break;
          }
          case "peak":
            geom = new THREE.ConeGeometry(1, 1, 5);
            break;
          case "ball":
            geom = new THREE.SphereGeometry(1, 36, 22);
            break;
          case "rock":
            geom = new THREE.IcosahedronGeometry(1, 0);
            break;
          case "cyl":
            geom = new THREE.CylinderGeometry(1, 1, 1, 48);
            break;
          case "cone":
          case "pine":
            geom = new THREE.ConeGeometry(1, 1, key === "pine" ? 7 : 24);
            break;
          case "rod":
            geom = new THREE.CylinderGeometry(
              sz[0],
              sz[0],
              new THREE.Vector3(...n.p).distanceTo(new THREE.Vector3(...n.end)),
              10,
            );
            break;
          case "ring":
            geom = new THREE.RingGeometry(sz[0], sz[1], 72);
            break;
          case "label":
            geom = new THREE.PlaneGeometry(1, 1);
            break;
          default:
            geom = new THREE.BoxGeometry(1, 1, 1);
        }
        geo.set(key, geom);
      } else geom = geo.get(key);
      let mk = [n.color,key,n.roughness,n.metalness,JSON.stringify(n.texture||{})].join("|");
      if (key === "label") {
        let tex = document.createElement("canvas");
        tex.width = 256;
        tex.height = 128;
        let cx = tex.getContext("2d");
        cx.font = "italic 900 122px Arial";
        cx.textAlign = "center";
        cx.fillStyle = n.color;
        cx.fillText(n.text, 123, 110);
        let t = new THREE.CanvasTexture(tex);
        t.colorSpace = THREE.SRGBColorSpace;
        mat = new THREE.MeshStandardMaterial({
          map: t,
          transparent: true,
          alphaTest: 0.1,
          side: THREE.DoubleSide,
        });
      } else {
        if (!mats.has(mk))
          mats.set(
            mk,
            new THREE.MeshStandardMaterial({
              color: n.color,
              roughness: n.roughness??(key === "ball" ? 0.3 : 0.85),
              metalness: n.metalness??(key === "ball" ? 0.19 : 0.02),
              flatShading: ["rock", "pine"].includes(key),
              side: THREE.DoubleSide,
            }),
          );
        mat = mats.get(mk);
      }
      if (n.texture && !mat.map) {
        let c = document.createElement("canvas");
        c.width = c.height = 128;
        let ctx = c.getContext("2d"),
          buf = ctx.createImageData(128, 128),
          seed = n.texture.seed || 1;
        for (let i = 0; i < buf.data.length; i += 4) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          let v =
            255 * (1 - (seed / 4294967296) * (n.texture.strength || 0.15));
          buf.data.set([v, v, v, 255], i);
        }
        ctx.putImageData(buf, 0, 0);
        let tex = new THREE.CanvasTexture(c);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(n.texture.frequency || 16, n.texture.frequency || 16);
        tex.colorSpace = THREE.SRGBColorSpace;
        mat.map = tex;
      }
      if(key==="grass"){
        let bend=new Float32Array(geom.attributes.position.count);
        for(let i=2;i<bend.length;i+=3)bend[i]=1;
        geom.setAttribute("bend",new THREE.BufferAttribute(bend,1));
        mat.onBeforeCompile=shader=>{shader.uniforms.washCenter=washCenter;shader.uniforms.washPower=washPower;
          shader.vertexShader="attribute float bend; uniform vec3 washCenter; uniform float washPower;\n"+shader.vertexShader.replace("#include <begin_vertex>","#include <begin_vertex>\nvec2 radial=position.xz-washCenter.xz;float push=(1.0-smoothstep(0.3,7.2,length(radial)))*washPower*bend;transformed.xz+=normalize(radial+vec2(0.001))*push*0.34;transformed.y-=0.12*push;");
        };
      }
      obj = new THREE.Mesh(geom, mat);
      obj.castShadow =
        !["草甸", "ring", "label"].includes(n.id) && key !== "rock";
      obj.receiveShadow = true;
      if (!["rod", "ring","terrain"].includes(key)) obj.scale.fromArray(sz);
      pick.push(obj);
    }
    obj.name = n.id;
    obj.position.fromArray(n.p || [0, 0, 0]);
    if (n.rot?.length === 3) obj.rotation.set(...n.rot);
    if (key === "rod") {
      let a = new THREE.Vector3(...n.p),
        b = new THREE.Vector3(...n.end);
      obj.position.copy(a.clone().add(b).multiplyScalar(0.5));
      obj.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        b.sub(a).normalize(),
      );
    }
    (objects[n.parent] || scene).add(obj);
    objects[n.id] = obj;
  }
  let trails=[],rotor=objects[res.motion?.rotor];
  if(rotor){for(let lag of [.06,.12,.18,.24]){let ghost=rotor.clone(true);ghost.traverse(obj=>{if(obj.isMesh){obj.material=obj.material.clone();obj.material.transparent=true;obj.material.opacity=.1;obj.material.depthWrite=false;obj.castShadow=false;obj.receiveShadow=false}});rotor.parent.add(ghost);trails.push({ghost,lag})}}
  let dust = [];
  for (let i = 0; i < 36; i++) {
    let o = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial({
        color: "#cabda0",
        transparent: true,
        depthWrite: false,
        opacity: 0.18,
      }),
    );
    scene.add(o);
    dust.push(o);
  }
  let fx = [];
  for (let i = 0; i < 50; i++) {
    let o = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshStandardMaterial({
        color: i < 34 ? "#5e655d" : i < 43 ? "#ffab41" : "#846576",
        transparent: i < 43,
        opacity: 0.66,
        roughness: 1,
      }),
    );
    scene.add(o);
    fx.push(o);
  }
  return {
    scene,
    objects,
    pick,
    fx,
    dust,
    trails,washCenter,washPower,
    originals: Object.fromEntries(
      Object.entries(objects).map(([k, o]) => [
        k,
        { p: o.position.clone(), q: o.quaternion.clone() },
      ]),
    ),
    camera: new THREE.PerspectiveCamera(36, 1, 0.1, 380),
  };
}
function releaseScenes() {
  let live = new Set();
  for (let s of Object.values(systems))
    for (let w of s.wins) {
      let r = w.data.resource || w.data.surface?.resource;
      if (r) live.add(r);
    }
  for (let [res, g] of deviceScenes)
    if (!live.has(res)) {
      let geo = new Set(),
        mat = new Set();
      g.scene.traverse((o) => {
        if (o.geometry) geo.add(o.geometry);
        if (o.material) mat.add(o.material);
        o.shadow?.map?.dispose();
      });
      geo.forEach((o) => o.dispose());
      mat.forEach((m) => {
        m.map?.dispose();
        m.dispose();
      });
      deviceScenes.delete(res);
    }
}
function keySample(res, t) {
  let keys = res.motion?.keys || [[0, 0, 0, 0, 0, 0, 0]],
    i = keys.findIndex((a) => a[0] >= t);
  if (i < 0) return keys.at(-1).slice(1);
  if (!i) return keys[0].slice(1);
  let b = keys[i],
    a = keys[i - 1],
    f = (t - a[0]) / (b[0] - a[0]);
  f = f * f * (3 - 2 * f);
  return b.slice(1).map((v, j) => a[j + 1] + (v - a[j + 1]) * f);
}
function renderFrame(canvas, res, d) {
  if (!canvas.clientWidth || !canvas.clientHeight || !res) return;
  let W = Math.min(1920, Math.ceil(canvas.clientWidth * devicePixelRatio)),
    H = Math.max(2, Math.round((W * canvas.clientHeight) / canvas.clientWidth)),
    tag = [
      d.frameTime,
      d.fxTime,
      d.cam,
      d.angle,
      d.pitch,
      d.zoom,
      W,
      H,
      d.revision,
    ].join("|");
  if (canvas.dataset.frame === tag) return;
  canvas.dataset.frame = tag;
  let r = gfx(),
    g = deviceScenes.get(res);
  if (!g) {
    g = createGpu(res);
    deviceScenes.set(res, g);
  }
  let { objects, fx, camera } = g,
    frame = d.pose || keySample(res, d.frameTime || 0),
    [x, y, z, rz, ry, rx] = frame,
    m = res.motion || {},
    t = d.frameTime || 0,
    body = objects[m.body];
  if (body) {
    body.position.set(x, y, z);
    body.rotation.set(rx, ry, rz);
  }
  let crash = d.rehearsal || d.record ? d.impact : m.impact,
    rt =
      crash != null && t > crash
        ? crash + 0.17 * (1 - Math.exp(-(t - crash) * 5.5))
        : t;
  if (objects[m.rotor]) objects[m.rotor].rotation.y = rt * rt * 2.8 + rt * 5;
  if (objects[m.tail]) objects[m.tail].rotation.z = rt * 36;
  const fxT = d.fxTime ?? t,
    impact = d.rehearsal || d.record ? d.impact : m.impact;
  let age = fxT - (impact ?? 1e5);
  g.washCenter.value.set(x,y,z);g.washPower.value=Math.min(1,t)*Math.max(0,1-y/7)*(age>0?Math.max(0,1-age):1);
  for(let {ghost,lag} of g.trails){ghost.visible=t>1.1&&age<0;ghost.rotation.y=rt*rt*2.8+rt*5-lag*Math.min(2,t*.35)}
  for (let [i, o] of g.dust.entries()) {
    let f = (fxT * 0.55 + i / 36) % 1,
      ang = i * 2.399,
      power =
        Math.min(1, fxT * 0.8) *
        Math.max(0, 1 - Math.abs(y) / 6) *
        (age > 0 ? Math.max(0, 1 - age / 2) : 1);
    o.visible = power > 0.02;
    if (o.visible) {
      o.position.set(
        x + Math.cos(ang) * (1 + f * 5),
        0.13 + f * 0.25,
        z + Math.sin(ang) * (1 + f * 5),
      );
      o.scale.set(0.32 + f * 0.76, 0.08 + f * 0.2, 0.35 + f * 0.68);
      o.material.opacity = power * (1 - f) * 0.22;
    }
  }
  for (let spec of m.debris || []) {
    let o = objects[spec.id],
      orig = g.originals[spec.id];
    if (!o || !orig) continue;
    o.position.copy(orig.p);
    o.quaternion.copy(orig.q);
    if (age > 0) {
      let h = Math.min(age, 1.5);
      o.position.addScaledVector(new THREE.Vector3(...spec.v), h);
      o.rotateX(h * spec.spin[0]);
      o.rotateY(h * spec.spin[1]);
      o.rotateZ(h * spec.spin[2]);
      o.updateWorldMatrix(true, false);
      let p = o.getWorldPosition(new THREE.Vector3());
      p.y = Math.max(0.17, p.y - 4.9 * h * h);
      o.position.copy(o.parent.worldToLocal(p));
    }
  }
  let sm =
    fxT - (d.rehearsal || d.record ? (d.smokeAt ?? 1e5) : (m.smoke ?? 1e5));
  for (let i = 0; i < fx.length; i++) {
    let o = fx[i],
      a = i * 2.399,
      life = (i < 34 ? sm : age) - (i % 7) * 0.09;
    o.visible = life > 0 && (i < 34 || age < 2.8 || i >= 43);
    if (!o.visible) continue;
    if (i < 34) {
      let f = (life * 0.58 + i * 0.087) % 1;
      o.position.set(
        x - 1.7 - f * 3 + Math.cos(a) * f,
        y + 1.9 + f * 4,
        z + Math.sin(a) * f,
      );
      o.scale.setScalar(0.11 + f * 0.66);
      o.material.opacity = 0.5 * (1 - f);
    } else if (i < 43) {
      let f = Math.min(age, 1.7);
      o.position.set(
        x + Math.cos(a) * f,
        y + 1 + Math.sin(age * 12 + i) * 0.65,
        z + Math.sin(a) * f,
      );
      o.scale.setScalar(Math.max(0.01, (2.6 - age) * 0.46));
    } else {
      let f = Math.min(1.4, age);
      o.position.set(
        x + Math.cos(a) * f * 3,
        0.17 + Math.max(0, 3 * f - 2.5 * f * f),
        z + Math.sin(a) * f * 3,
      );
      o.scale.set(0.53, 0.14, 0.24);
      o.rotation.set(f * i, 0, f * 3);
    }
  }
  let target = new THREE.Vector3(x - 1, y + 1.65, z),
    c = res.cameras?.[d.cam === "跟随镜头" ? 1 : 0] || [9, 5, 13],
    off = new THREE.Vector3(...c);
  if (d.cam === "自由环绕") {
    let ang = d.angle ?? 1.1,
      el = d.pitch ?? 0.32,
      dist = d.zoom || 16;
    off.set(
      Math.cos(ang) * Math.cos(el) * dist,
      Math.sin(el) * dist,
      Math.sin(ang) * Math.cos(el) * dist,
    );
  } else {
    off.multiplyScalar(1.08);
    if (d.cam !== "跟随镜头")
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.14 * Math.sin(t * 0.25));
  }
  camera.aspect = W / H;
  camera.fov = Math.max(32, 46 / Math.max(0.6, camera.aspect));
  camera.position.copy(target).add(off);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  r.setSize(W, H, false);
  r.render(g.scene, camera);
  canvas.width = W;
  canvas.height = H;
  canvas.getContext("2d").drawImage(r.domElement, 0, 0);
  renders.set(canvas, { g, cam: camera.clone() });
}
function pickHit(c, e) {
  let info = renders.get(c);
  if (!info) return "";
  let rect = c.getBoundingClientRect(),
    ray = new THREE.Raycaster();
  ray.setFromCamera(
    new THREE.Vector2(
      (2 * (e.clientX - rect.left)) / rect.width - 1,
      1 - (2 * (e.clientY - rect.top)) / rect.height,
    ),
    info.cam,
  );
  return ray.intersectObjects(info.g.pick,false)[0]||null;
}
