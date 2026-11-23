import React, { useRef, useEffect } from "react";
import * as THREE from "three";
let renderer;
const cache = new Map();
const views = new Map();
const viewCameras = new WeakMap();
function disposeScene(record) {
  record?.scene.traverse((o) => {
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      m?.map?.dispose();
      m?.dispose();
    }
    o.shadow?.map?.dispose();
  });
}
// Drawing never advances the VM. This timer also works when Windows occludes the app.
setInterval(() => {
  for (const view of views.values()) view.draw();
}, 100);
window.nestGraphics = {
  stats: () => ({
    contexts: renderer ? 1 : 0,
    views: views.size,
    scenes: cache.size,
    geometry: renderer?.info.memory.geometries || 0,
  }),
  lose: () => renderer?.forceContextLoss(),
  restore: () => renderer?.forceContextRestore(),
};
function getRenderer() {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: false,
    });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
    });
    renderer.domElement.addEventListener("webglcontextrestored", () => {
      for (const record of cache.values()) disposeScene(record);
      cache.clear();
      setTimeout(() => {
        for (const view of views.values()) view.draw();
      }, 0);
    });
  }
  return renderer;
}
function geometry(n) {
  switch (n.shape) {
    case "sphere":
      return new THREE.SphereGeometry(0.5, 32, 20);
    case "cylinder":
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 48);
    case "cone":
      return new THREE.ConeGeometry(0.5, 1, 7);
    case "ring":
      return new THREE.RingGeometry(0.44, 0.5, 64);
    case "text":
      return new THREE.PlaneGeometry(1, 1);
    case "terrain": {
      let g = new THREE.PlaneGeometry(1, 1, 60, 60);
      g.rotateX(-Math.PI / 2);
      let a = g.attributes.position;
      for (let i = 0; i < a.count; i++) {
        const x = a.getX(i) * 100,
          z = a.getZ(i) * 100;
        let y = Math.sin(x * 0.19) * Math.cos(z * 0.13) * 0.6;
        const flat = Math.min(1, Math.max(0, (Math.abs(z) - 7) / 10));
        a.setY(i, y * flat);
      }
      g.computeVertexNormals();
      return g;
    }
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}
function build(data) {
  let scene = new THREE.Scene();
  scene.background = new THREE.Color(data.sky || "#c8d4d5");
  scene.fog = new THREE.Fog(data.fog || data.sky || "#c8d4d5", 40, 135);
  let ambient = new THREE.HemisphereLight("#e7f2ff", "#7b735a", 2.3);
  scene.add(ambient);
  for (let l of data.lights || []) {
    const sun = new THREE.DirectionalLight(l.color || "#fff", l.intensity || 3);
    sun.position.fromArray(l.position);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -35,
      right: 35,
      top: 35,
      bottom: -35,
      near: 0.1,
      far: 120,
    });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.035;
    scene.add(sun);
  }
  let groups = {},
    objects = [];
  for (let n of data.nodes || []) {
    let mat = new THREE.MeshStandardMaterial({
      color: n.color || "#aaa",
      metalness: n.metalness || 0,
      roughness: n.roughness ?? 0.7,
      side: THREE.DoubleSide,
    });
    if (n.shape === "text") {
      let c = document.createElement("canvas");
      c.width = 256;
      c.height = 256;
      let ctx = c.getContext("2d");
      ctx.fillStyle = n.color;
      ctx.font = "bold 180px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(n.text, 128, 140);
      mat.map = new THREE.CanvasTexture(c);
      mat.transparent = true;
      mat.alphaTest = 0.15;
      mat.color.set("#fff");
    }
    let mesh = new THREE.Mesh(geometry(n), mat);
    mesh.position.fromArray(n.position || [0, 0, 0]);
    mesh.scale.fromArray(n.scale || [1, 1, 1]);
    mesh.rotation.fromArray([...(n.rotation || [0, 0, 0]), "XYZ"]);
    if (n.ground || n.shape === "ring") mesh.rotation.x = -Math.PI / 2;
    mesh.castShadow = n.shape !== "terrain" && n.shape !== "ring";
    mesh.receiveShadow = true;
    mesh.userData = {
      ...n,
      baseP: mesh.position.clone(),
      baseR: mesh.rotation.clone(),
    };
    if (n.group) {
      if (!groups[n.group]) {
        groups[n.group] = new THREE.Group();
        scene.add(groups[n.group]);
      }
      groups[n.group].add(mesh);
    } else scene.add(mesh);
    objects.push(mesh);
  }
  const effects = [];
  for (const e of data.effects || []) {
    let list = [];
    for (let i = 0; i < e.count; i++) {
      let mesh = new THREE.Mesh(
        e.type === "fire"
          ? new THREE.IcosahedronGeometry(0.15, 0)
          : new THREE.SphereGeometry(0.22, 7, 5),
        new THREE.MeshStandardMaterial({
          color: e.color,
          transparent: true,
          opacity: 0.35,
          roughness: 1,
          emissive: e.type === "fire" ? e.color : "#000",
          emissiveIntensity: e.type === "fire" ? 2 : 0,
          depthWrite: false,
        }),
      );
      scene.add(mesh);
      list.push(mesh);
    }
    effects.push({ e, list });
  }
  return {
    scene,
    groups,
    objects,
    effects,
    camera: new THREE.PerspectiveCamera(42, 1, 0.1, 200),
  };
}
function sample(data, t) {
  const keys = data.tracks || [];
  if (!keys.length) return { position: [0, 0, 0], rotation: [0, 0, 0] };
  let i = keys.findIndex((k) => k.time >= t);
  if (i <= 0) return i === 0 ? keys[0] : keys.at(-1);
  const a = keys[i - 1],
    b = keys[i],
    f = (t - a.time) / (b.time - a.time),
    u = f * f * (3 - 2 * f);
  return {
    position: a.position.map((v, j) =>
      THREE.MathUtils.lerp(v, b.position[j], u),
    ),
    rotation: a.rotation.map((v, j) =>
      THREE.MathUtils.lerp(v, b.rotation[j], u),
    ),
  };
}
function renderFrame(canvas, data, p, key) {
  if (!canvas || !canvas.clientWidth || !canvas.clientHeight) return;
  const width = Math.min(1800, Math.max(200, canvas.clientWidth)),
    height = Math.min(1100, Math.max(120, canvas.clientHeight));
  let rec = cache.get(key);
  const signature = JSON.stringify(data);
  if (!rec || rec.signature !== signature) {
    disposeScene(rec);
    rec = { ...build(data), data, signature };
    cache.set(key, rec);
  }
  const { scene, camera, groups, objects, effects } = rec;
  const visibleFlight = p.renderFlight || p.flight;
  const effectFlight = p.renderEffectFlight || visibleFlight;
  let t = p.partTime ?? p.position;
  let pose = sample(data, t);
  if (p.mode === "rehearsal" || data.recordFrames) {
    const f = visibleFlight;
    pose = {
      position: [f.x, f.y, f.z],
      rotation: [f.pitch || 0, (-p.heading * Math.PI) / 180, f.roll],
    };
  }
  for (let g of Object.values(groups)) {
    g.position.fromArray(pose.position);
    g.rotation.fromArray([...pose.rotation, "XYZ"]);
  }
  objects.forEach((m, i) => {
    const n = m.userData;
    if (n.group && m.parent !== groups[n.group]) groups[n.group].add(m);
    m.position.copy(n.baseP);
    m.rotation.copy(n.baseR);
    if (n.spin) {
      const speed = Math.min(1, t / 1.8);
      m.rotation.x += n.spin[0] * t * speed;
      m.rotation.y += n.spin[1] * t * speed;
      m.rotation.z += n.spin[2] * t * speed;
    }
    let broken =
      (n.breakAt && t >= n.breakAt && p.mode !== "rehearsal") ||
      ((p.renderCrashed ?? p.crashed) && n.breakAt);
    if (broken) {
      let u =
        p.mode === "rehearsal"
          ? Math.max(0, t - (p.frames.find((x) => x.crashed)?.t ?? t))
          : t - n.breakAt;
      let k = Math.min(u, 2);
      let hitPose = sample(data, n.breakAt);
      if (p.mode === "rehearsal" || data.recordFrames) {
        const f =
          (
            p.frames?.find((x) => x.crashed) ||
            data.recordFrames?.find((x) => x.crashed)
          )?.flight || p.flight;
        hitPose = {
          position: [f.x, f.y, f.z],
          rotation: [0, (-p.heading * Math.PI) / 180, f.roll],
        };
      }
      let q = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(...hitPose.rotation),
        ),
        anchor = n.baseP
          .clone()
          .applyQuaternion(q)
          .add(new THREE.Vector3(...hitPose.position));
      if (m.parent !== scene) scene.add(m);
      m.position.copy(anchor);
      m.position.x += Math.sin(i * 4) * k * 1.6;
      m.position.y = Math.max(0.2, anchor.y + 3 * k - 5 * k * k);
      m.position.z += Math.cos(i * 3) * k * 1.6;
      m.quaternion.copy(q);
      m.rotateX(k * 2);
      m.rotateZ(k * (i % 2 ? 3 : -3));
    }
  });
  for (let { e, list } of effects) {
    let et = p.effectTime ?? t;
    const active =
      p.mode === "rehearsal"
        ? (e.type === "dust" && effectFlight.y < 4) ||
          ((p.renderCrashed ?? p.crashed) && e.type !== "dust")
        : et >= e.start && et <= e.end;
    list.forEach((m, i) => {
      m.visible = !!active;
      if (!active) return;
      let age = ((et - e.start) * 0.3 + i * 0.031) % 1;
      if (age < 0) age += 1;
      let a = i * 2.399;
      let r = e.radius * (0.3 + age * 2);
      let origin = e.origin;
      if (p.mode === "rehearsal")
        origin = [effectFlight.x, 0.1, effectFlight.z];
      m.position.set(
        origin[0] + Math.sin(a) * r,
        origin[1] + (e.type === "dust" ? age * 0.7 : age * 6),
        origin[2] + Math.cos(a) * r,
      );
      m.scale.setScalar(e.type === "fire" ? 1 + age * 2 : 1 + age * 5);
      m.material.opacity = (1 - age) * (e.type === "dust" ? 0.25 : 0.5);
    });
  }
  let target = new THREE.Vector3(...pose.position).add(
    new THREE.Vector3(0, 1.7, 0),
  );
  let orbit = p.orbit || 0,
    zoom = p.zoom || 1;
  if (!data.tracks?.length && !p.mode?.includes("rehearsal"))
    target.fromArray(data.camera?.target || [0, 0, 0]);
  if (p.camera === "自由环绕") {
    camera.position
      .copy(target)
      .add(
        new THREE.Vector3(
          Math.sin(orbit + 0.7) * 17 * zoom,
          8 * zoom,
          Math.cos(orbit + 0.7) * 17 * zoom,
        ),
      );
  } else if (p.camera === "跟随镜头") {
    camera.position
      .copy(target)
      .add(new THREE.Vector3(9, 4, 11).multiplyScalar(zoom));
  } else {
    const offset = new THREE.Vector3(
      ...(data.camera?.position || [8.5, 6.4, 11]),
    ).sub(new THREE.Vector3(...(data.camera?.target || [0, 1.7, 0])));
    camera.position.copy(target).add(offset.multiplyScalar(zoom));
  }
  camera.lookAt(target);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  const r = getRenderer();
  if (r.getContext().isContextLost()) return;
  r.setSize(width, height, false);
  r.render(scene, camera);
  viewCameras.set(canvas, camera.clone());
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  canvas.getContext("2d").drawImage(r.domElement, 0, 0, width, height);
  rec.last = { width, height };
}
export default function Stage({ w, onAction }) {
  let ref = useRef(),
    down = useRef(null);
  const latest = useRef(w);
  latest.current = w;
  useEffect(() => {
    let draw = () => {
      try {
        const current = latest.current;
        renderFrame(ref.current, current.scene, current.player, current.id);
      } catch (e) {
        console.error(e);
      }
    };
    const canvas = ref.current;
    views.set(canvas, { key: w.id, draw });
    draw();
    let ob = new ResizeObserver(draw);
    if (ref.current) ob.observe(ref.current);
    return () => {
      ob.disconnect();
      views.delete(canvas);
      if (![...views.values()].some((view) => view.key === w.id)) {
        disposeScene(cache.get(w.id));
        cache.delete(w.id);
      }
    };
  }, [w.id]);
  return (
    <canvas
      ref={ref}
      className="stage-canvas"
      data-testid="player-view"
      aria-label="三维场景，拖动自由环绕，滚轮缩放"
      onPointerDown={(e) => {
        down.current = { x: e.clientX, y: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerUp={(e) => {
        if (!down.current) return;
        const dx = e.clientX - down.current.x;
        if (Math.abs(dx) > 5) {
          onAction("camera", "自由环绕");
          onAction("orbit", { dx: dx * 0.008, zoom: 0 });
        } else {
          let rec = cache.get(w.id);
          if (rec) {
            let b = e.currentTarget.getBoundingClientRect();
            let ray = new THREE.Raycaster();
            ray.setFromCamera(
              new THREE.Vector2(
                ((e.clientX - b.left) / b.width) * 2 - 1,
                (-(e.clientY - b.top) / b.height) * 2 + 1,
              ),
              viewCameras.get(ref.current) || rec.camera,
            );
            const hit = ray.intersectObjects(rec.objects)[0];
            onAction(
              "select",
              hit
                ? hit.object.userData.name +
                    " · " +
                    (w.player.crashed ? "损坏" : "完好")
                : "地面",
            );
            if (
              hit &&
              hit.object.userData.shape === "terrain" &&
              w.player.mode === "rehearsal"
            )
              onAction(
                "heading",
                (Math.atan2(
                  hit.point.z - w.player.flight.z,
                  hit.point.x - w.player.flight.x,
                ) *
                  180) /
                  Math.PI,
              );
          }
        }
        down.current = null;
      }}
      onWheel={(e) => onAction("orbit", { dx: 0, zoom: e.deltaY * 0.001 })}
    />
  );
}
