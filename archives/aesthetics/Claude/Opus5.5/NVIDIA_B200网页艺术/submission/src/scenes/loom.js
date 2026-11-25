// 经纬：从推近的张量核心里展开的乘加图形（屏幕空间，叠在封装场景之上）
// 用与版图纹样相同的线条语言：细线的经线（冰蓝）与纬线（琥珀），交点是张量核心里的菱形乘加单元（荧绿），
// 每个单元的亮度是一路累加下来的乘积。展开半径从 4×4 的菱形格开始，铺满画面，再收回去。
import * as THREE from 'three';

export function createLoom(scene, gl) {
  const U = {
    uCenter: { value: new THREE.Vector2(0, 0) }, uCell: { value: 60 }, uR: { value: 0 }, uK: { value: 0 },
    uPass: { value: -1e4 }, uBands: { value: 0 }, uDim: { value: 0 }, uTime: { value: 0 }, uSc: { value: 1 }, uAmt: { value: 0 },
    uMouse: { value: new THREE.Vector3(-1e4, -1e4, 0) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthTest: false, depthWrite: false, premultipliedAlpha: true,
    vertexShader: `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec2 uCenter; uniform vec3 uMouse;
      uniform float uCell, uR, uK, uPass, uBands, uDim, uTime, uSc, uAmt;
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
      float accum(vec2 c){
        float s = 0.0, K = uK*12.0;
        for (int k = 0; k < 12; k++) { float fk = float(k); s += clamp(K - fk, 0.0, 1.0)*(h2(vec2(c.y, fk)) - 0.5)*(h2(vec2(fk + 7.0, c.x)) - 0.5); }
        return s;
      }
      void main(){
        vec2 px = gl_FragCoord.xy;
        vec2 dm = px - uMouse.xy; float dist = length(dm);
        px += (dm/max(dist, 1.0))*uMouse.z*12.0*uSc*exp(-dist/(140.0*uSc))*sin(dist*0.08/uSc - uTime*12.0);
        vec2 q = (px - uCenter)/uCell;
        vec2 g = q + 0.5, c = floor(g + 0.5), f = g - c;
        float cheb = max(abs(q.x), abs(q.y));
        float inside = smoothstep(uR + 0.35, uR - 0.35, cheb);
        float lw = 1.0*uSc/uCell;
        float warp = smoothstep(lw*1.6, lw*0.2, abs(f.x));
        float weft = smoothstep(lw*1.6, lw*0.2, abs(f.y));
        // 一上一下：交点附近让开另一根线
        float par = mod(c.x + c.y, 2.0);
        float near = step(abs(f.x), 0.2)*step(abs(f.y), 0.2);
        warp *= mix(1.0, 1.0 - near, par); weft *= mix(1.0 - near, 1.0, par);
        // 交点：菱形乘加单元
        float dd = abs(f.x) + abs(f.y);
        float ring = smoothstep(lw*1.6, 0.0, abs(dd - 0.17));
        float dv = accum(c);
        float fill = step(dd, 0.17)*min(1.0, abs(dv)*5.5)*min(1.0, uK*3.0);
        // 梭子：正在累加的那一步扫过的行
        float kk = floor(uK*12.0);
        float shuttle = step(abs(mod(c.y, 12.0) - kk), 0.5)*step(0.001, uK)*step(uK, 0.999)*0.8;
        // 一层层运算：推理的光沿行进方向穿过一条条纵向的“层”
        float band = exp(-abs(px.x - uPass)/(170.0*uSc))*uBands;
        float layer = step(0.5, fract(c.x/6.0))*0.25*uBands;
        vec3 col = vec3(0.49, 0.88, 1.0)*warp*(0.32 + layer + band*1.2) + vec3(1.0, 0.7, 0.28)*weft*(0.32 + shuttle + band*0.8);
        col += vec3(0.72, 0.95, 0.29)*(ring*(0.55 + band) + fill*(0.9 + band*0.8));
        col *= inside*uAmt;
        float a = clamp(uDim*uAmt + max(max(warp, weft), ring)*inside*uAmt*0.6, 0.0, 1.0);
        gl_FragColor = vec4(col, a);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 999;
  mesh.visible = false;
  scene.add(mesh);
  return {
    mesh, U,
    /** o: {amt, center:[x,y](CSS px，左上原点), cell(CSS px), R(格), k, pass(CSS px), bands, dim, mouse:[x,y,s]} */
    update(t, o) {
      const amt = o.amt ?? 0;
      mesh.visible = amt > 0.001;
      if (!mesh.visible) return;
      const dpr = gl.renderer.getPixelRatio(), H = window.innerHeight;
      U.uAmt.value = amt; U.uTime.value = t; U.uSc.value = Math.max(1, (H * dpr) / 1080);
      U.uCenter.value.set(o.center[0] * dpr, (H - o.center[1]) * dpr);
      U.uCell.value = o.cell * dpr; U.uR.value = o.R; U.uK.value = o.k ?? 0;
      U.uPass.value = (o.pass ?? -1e4) * dpr; U.uBands.value = o.bands ?? 0; U.uDim.value = o.dim ?? 0;
      const m = o.mouse || [-1e4, -1e4, 0];
      U.uMouse.value.set(m[0] * dpr, (H - m[1]) * dpr, m[2]);
    },
  };
}
