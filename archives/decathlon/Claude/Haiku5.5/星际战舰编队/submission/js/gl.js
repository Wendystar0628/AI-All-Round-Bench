// WebGL2 渲染层：着色器、网格上传、MSAA 场景、泛光与色调映射。
// 所有绘制都用相机相对坐标（位置在 JS 中以双精度减去相机位置后再转为 float）。

var GLR = (function () {
  var gl = null, canvas = null;
  var hdrOK = false, samples = 1;
  var W = 1, H = 1;
  var progs = {};
  var uniCache = {};
  var targets = {};
  var quadVAO = null, starVAO = null, starBuf = null, partVAO = null, partBuf = null, partCap = 0;
  var sphereMesh = null;
  var partData = null;
  var MAXP = 65536;

  // ---------- 着色器源 ----------
  var VOXEL_VS = [
    '#version 300 es',
    'precision highp float;',
    'in vec3 aPos; in uvec4 aMeta; in vec4 aCol;',
    'uniform mat4 uModel; uniform mat4 uView; uniform mat4 uProj;',
    'out vec3 vLocal; out vec3 vWorld; out vec3 vN; out vec3 vCol; out float vAO; flat out int vMat;',
    'void main(){',
    '  int idx = int(aMeta.x); int ax = idx >> 1;',
    '  float sg = ((idx & 1) == 0) ? 1.0 : -1.0;',
    '  vec3 n = vec3(ax == 0 ? 1.0 : 0.0, ax == 1 ? 1.0 : 0.0, ax == 2 ? 1.0 : 0.0) * sg;',
    '  vec4 wp = uModel * vec4(aPos, 1.0);',
    '  vWorld = wp.xyz; vLocal = aPos; vN = mat3(uModel) * n;',
    '  vCol = pow(aCol.rgb, vec3(2.2)); vAO = float(aMeta.y) / 3.0; vMat = int(aMeta.z);',
    '  gl_Position = uProj * uView * wp;',
    '}'
  ].join('\n');

  var VOXEL_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec3 vLocal; in vec3 vWorld; in vec3 vN; in vec3 vCol; in float vAO; flat in int vMat;',
    'uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uSkyCol; uniform vec3 uGndCol; uniform vec3 uFogCol; uniform float uFogDen;',
    'uniform vec4 uParams;',        // x 发光增益, y 主炮蓄能, z 推进, w 时间
    'uniform vec3 uTint;',
    'uniform vec4 uImpA[4]; uniform vec4 uImpB[4];',
    'uniform vec3 uPLPos[4]; uniform vec4 uPLCol[4]; uniform int uPLCount;',
    'uniform float uAlpha;',
    'out vec4 oColor;',
    'float h31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }',
    'float vn(vec3 p){ vec3 i=floor(p); vec3 f=fract(p); f=f*f*(3.0-2.0*f);',
    '  float a=h31(i), b=h31(i+vec3(1,0,0)), c=h31(i+vec3(0,1,0)), d=h31(i+vec3(1,1,0));',
    '  float e=h31(i+vec3(0,0,1)), g=h31(i+vec3(1,0,1)), hh=h31(i+vec3(0,1,1)), k=h31(i+vec3(1,1,1));',
    '  return mix(mix(mix(a,b,f.x),mix(c,d,f.x),f.y), mix(mix(e,g,f.x),mix(hh,k,f.x),f.y), f.z); }',
    'void main(){',
    '  vec3 n = normalize(vN);',
    '  vec3 V = normalize(-vWorld);',
    '  vec3 cell = floor(vLocal - n * 0.5);',
    '  float grain = 0.93 + 0.14 * h31(cell * 1.7 + 3.1);',
    '  vec3 base = vCol * grain;',
    '  float ao = 0.42 + 0.58 * pow(max(vAO, 1e-3), 0.9);',
    '  float ndl = max(dot(n, uSunDir), 0.0);',
    '  vec3 hemi = mix(uGndCol, uSkyCol, n.y * 0.5 + 0.5);',
    '  vec3 lit = uSunCol * ndl + hemi;',
    '  vec3 H = normalize(uSunDir + V);',
    '  float sp = pow(max(dot(n, H), 1e-3), 36.0);',
    '  vec3 col;',
    '  float alpha = 1.0;',
    '  if (vMat == 1) {',                     // 暗色凹槽
    '    col = base * 0.28 * (lit * 0.8 + 0.2) * ao;',
    '  } else if (vMat == 2) {',              // 点缀金属
    '    col = base * lit * ao * 1.05 + uSunCol * pow(max(dot(n,H), 1e-3), 90.0) * 1.1 * ndl;',
    '  } else if (vMat == 3) {',              // 自发光
    '    float pul = 0.9 + 0.1 * sin(uParams.w * 2.3 + vLocal.x * 0.3);',
    '    col = base * (0.25 * lit * ao + uParams.x * pul);',
    '  } else if (vMat == 4) {',              // 透明玻璃
    '    float fr = pow(max(1.0 - max(dot(n, V), 0.0), 1e-3), 3.0);',
    '    col = mix(base * 0.5, uSkyCol * 2.0, fr) + uSunCol * sp * 0.6;',
    '    alpha = 0.42 + 0.5 * fr;',
    '  } else if (vMat == 5) {',              // 主炮发光槽：沿身蓄能逐段亮起
    '    float seg = clamp((vLocal.x - 925.0) / 175.0, 0.0, 1.0);',
    '    float on = smoothstep(uParams.y + 0.06, uParams.y - 0.02, seg);',
    '    col = base * (0.35 * lit * ao + (0.25 + 3.4 * on) * uParams.x);',
    '  } else if (vMat == 6) {',              // 推进喷口内核
    '    float fl = 0.85 + 0.15 * sin(uParams.w * 9.0 + vLocal.y * 0.7);',
    '    col = base * (0.55 + uParams.z * 2.6) * fl * uParams.x;',
    '  } else if (vMat == 7) {',              // 全息显示面
    '    float sc = 0.6 + 0.4 * sin(vLocal.y * 1.4 - uParams.w * 5.0);',
    '    col = base * uParams.x * sc;',
    '  } else if (vMat == 8) {',              // 流光导能
    '    float fl = 0.5 + 0.5 * sin((vLocal.x + vLocal.z) * 0.16 - uParams.w * 7.0 + vLocal.y * 0.05);',
    '    col = base * uParams.x * (0.25 + 0.9 * fl);',
    '  } else {',                              // 舰体主壳
    '    col = base * uTint * (lit * ao) * 1.0 + uSunCol * sp * 0.22 * ndl * ao;',
    '  }',
    '  // 点光源（舱内）',
    '  for (int i = 0; i < 4; i++) {',
    '    if (i >= uPLCount) break;',
    '    vec3 L = uPLPos[i] - vWorld; float d = length(L); L /= max(d, 1e-3);',
    '    float att = 1.0 / (1.0 + (d * d) / (uPLCol[i].a * uPLCol[i].a));',
    '    float pd = max(dot(n, L), 0.0);',
    '    if (vMat == 3 || vMat == 6 || vMat == 7 || vMat == 8) col += base * uPLCol[i].rgb * att * 0.12;',
    '    else col += base * uPLCol[i].rgb * att * pd * 0.9;',
    '  }',
    '  // 未受击陨石与受击裂口的余辉',
    '  for (int i = 0; i < 4; i++) {',
    '    if (uImpA[i].w <= 0.0) continue;',
    '    float r = uImpB[i].x;',
    '    float d = length(vLocal - uImpA[i].xyz);',
    '    float g = exp(-(d * d) / (r * r + 1.0));',
    '    float cr = smoothstep(0.55, 0.9, vn(vLocal * 0.45 + float(i) * 7.3));',
    '    vec3 hot = mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.92, 0.7), g);',
    '    col += hot * uImpA[i].w * g * (0.25 + 0.9 * cr) * exp(-uImpB[i].y * 0.5);',
    '  }',
    '  float f = 1.0 - exp(-length(vWorld) * uFogDen);',
    '  col = mix(col, uFogCol, f);',
    '  if (!(col.r >= 0.0 && col.r < 1e4 && col.g >= 0.0 && col.g < 1e4 && col.b >= 0.0 && col.b < 1e4)) col = vec3(1.0, 0.0, 1.0);',
    '  oColor = vec4(col, alpha * uAlpha);',
    '}'
  ].join('\n');

  var BG_VS = [
    '#version 300 es',
    'precision highp float;',
    'const vec2 P[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));',
    'out vec2 vUV;',
    'void main(){ vec2 p = P[gl_VertexID]; vUV = p; gl_Position = vec4(p, 0.9999, 1.0); }'
  ].join('\n');

  var BG_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUV; out vec4 o;',
    'uniform vec3 uCamR; uniform vec3 uCamU; uniform vec3 uCamF; uniform float uTanY; uniform float uAspect;',
    'uniform vec3 uSunDir; uniform float uSunGlow; uniform float uTime; uniform float uNeb;',
    'uniform vec3 uPlanP; uniform vec3 uPlanT; uniform float uPlanR;',
    'float square(float x){ return x * x; }',
    'float h31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }',
    'float vn(vec3 p){ vec3 i=floor(p); vec3 f=fract(p); f=f*f*(3.0-2.0*f);',
    '  float a=h31(i), b=h31(i+vec3(1,0,0)), c=h31(i+vec3(0,1,0)), d=h31(i+vec3(1,1,0));',
    '  float e=h31(i+vec3(0,0,1)), g=h31(i+vec3(1,0,1)), hh=h31(i+vec3(0,1,1)), k=h31(i+vec3(1,1,1));',
    '  return mix(mix(mix(a,b,f.x),mix(c,d,f.x),f.y), mix(mix(e,g,f.x),mix(hh,k,f.x),f.y), f.z); }',
    'float fbm(vec3 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=a*vn(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; } return s; }',
    'void main(){',
    '  vec3 d = normalize(uCamF + uCamR * (vUV.x * uTanY * uAspect) + uCamU * (vUV.y * uTanY));',
    '  vec3 col = mix(vec3(0.006,0.008,0.02), vec3(0.018,0.024,0.05), smoothstep(-0.4, 0.9, d.y));',
    '  // 星云色层：两组低频噪声叠合，偏蓝紫与青',
    '  float n1 = fbm(d * 2.2 + vec3(4.0, 1.0, 2.0));',
    '  float n2 = fbm(d * 4.6 + vec3(-3.0, 7.0, 0.5));',
    '  float band = exp(-square((d.y + 0.12 + 0.12*sin(d.x*3.0)) * 2.4));',
    '  vec3 cA = vec3(0.10, 0.12, 0.30), cB = vec3(0.02, 0.22, 0.26), cC = vec3(0.26, 0.08, 0.18);',
    '  col += uNeb * (cA * smoothstep(0.45, 0.9, n1) * 0.7 + cB * smoothstep(0.5, 0.95, n2) * 0.45 + cC * smoothstep(0.6,1.0,n1*n2) * 0.25) * (0.35 + band);',
    '  // 主光天体：大光晕与日冕',
    '  float s = max(dot(d, uSunDir), 0.0);',
    '  vec3 sunC = vec3(1.0, 0.86, 0.64);',
    '  col += sunC * (pow(max(s, 1e-4), 900.0) * 6.0 + pow(max(s, 1e-4), 120.0) * 0.55 * uSunGlow + pow(max(s, 1e-4), 14.0) * 0.12 * uSunGlow + pow(max(s, 1e-4), 3.0) * 0.025 * uSunGlow);',
    '  // 天体弧面：一颗带云带的行星，由主光方向照亮，背光一侧保留暗色与大气边缘',
    '  float cdp = clamp(dot(d, uPlanP), -1.0, 1.0);',
    '  float rr = acos(cdp) / uPlanR;',
    '  vec3 tv = d - uPlanP * cdp;',
    '  vec3 dirT = length(tv) > 1e-5 ? normalize(tv) : uPlanT;',
    '  float rc = min(rr, 1.0);',
    '  vec3 nP = normalize(dirT * rc + uPlanP * sqrt(max(1.0 - rc * rc, 0.0)));',
    '  float ndlP = max(dot(nP, uSunDir), 0.0);',
    '  float bandsP = fbm(nP * 3.2 + vec3(0.0, 2.0, 0.0));',
    '  vec3 pcol = mix(vec3(0.010, 0.02, 0.035), vec3(0.24, 0.34, 0.42), ndlP) * (0.7 + 0.5 * bandsP);',
    '  col = mix(col, pcol, smoothstep(1.0, 0.985, rr));',
    '  float halo = exp(-max(rr - 1.0, 0.0) * 9.0) * step(0.9, rr);',
    '  col += vec3(0.18, 0.4, 0.65) * halo * (0.25 + 0.75 * max(dot(dirT, uSunDir), 0.0)) * 0.45;',
    '  o = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var STAR_VS = [
    '#version 300 es',
    'precision highp float;',
    'in vec3 aDir; in vec4 aStar;',   // aStar: 亮度, 尺寸, 闪烁相位, 色温(0冷..1暖)
    'uniform mat4 uView; uniform mat4 uProj; uniform float uPx; uniform float uTime;',
    'out vec4 vC;',
    'void main(){',
    '  vec4 p = uProj * uView * vec4(aDir * 60000.0, 1.0);',
    '  gl_Position = vec4(p.xy, p.w * 0.99999, p.w);',
    '  float tw = 0.85 + 0.15 * sin(uTime * (1.0 + aStar.z * 2.0) + aStar.z * 40.0);',
    '  vec3 cool = vec3(0.7, 0.85, 1.0), warm = vec3(1.0, 0.82, 0.6);',
    '  vec3 c = mix(cool, warm, aStar.w) * aStar.x * tw;',
    '  vC = vec4(c, aStar.x);',
    '  gl_PointSize = max(1.0, aStar.y * uPx);',
    '}'
  ].join('\n');

  var PLAN_P = MATH.V.norm([0.65, 0.175, -0.73]);
  var PLAN_T = MATH.V.norm(MATH.V.cross([0, 1, 0], PLAN_P));
  var STAR_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec4 vC; out vec4 o;',
    'void main(){',
    '  vec2 q = gl_PointCoord * 2.0 - 1.0; float r = length(q);',
    '  float a = smoothstep(1.0, 0.0, r); a = a * a;',
    '  o = vec4(vC.rgb * a, 1.0);',
    '}'
  ].join('\n');

  // 粒子/光效：每个实例为一个朝向相机的四边形；轴向非零时形成沿轴的条带
  var PART_VS = [
    '#version 300 es',
    'precision highp float;',
    'in vec4 aP0; in vec4 aP1; in vec4 aCol; in vec4 aPar;',
    'uniform mat4 uView; uniform mat4 uProj; uniform float uTime;',
    'out vec2 vUV; out vec4 vCol; flat out int vKind; out vec4 vPar; out float vLen;',
    'void main(){',
    '  vec3 c = aP0.xyz; float hw = aP0.w;',
    '  vec3 ax = aP1.xyz; float hl = aP1.w;',
    '  vec2 corner = vec2((gl_VertexID & 1) == 0 ? -1.0 : 1.0, (gl_VertexID & 2) == 0 ? -1.0 : 1.0);',
    '  vec3 toCam = -c; float dl = length(toCam); vec3 vdir = toCam / max(dl, 1e-4);',
    '  vec3 right; vec3 along;',
    '  if (dot(ax, ax) > 0.0) {',
    '    along = normalize(ax);',
    '    right = cross(vdir, along); float rl = length(right);',
    '    if (rl < 1e-4) right = vec3(1.0,0.0,0.0); else right /= rl;',
    '  } else {',
    '    right = vec3(uView[0][0], uView[1][0], uView[2][0]);',
    '    along = vec3(uView[0][1], uView[1][1], uView[2][1]);',
    '    hl = hw;',
    '  }',
    '  vec3 wp = c + along * (corner.y * hl) + right * (corner.x * hw);',
    '  vUV = vec2(corner.x, corner.y);',
    '  vCol = aCol; vKind = int(aPar.x + 0.5); vPar = aPar; vLen = hl / max(hw, 1e-4);',
    '  gl_Position = uProj * uView * vec4(wp, 1.0);',
    '}'
  ].join('\n');

  var PART_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUV; in vec4 vCol; flat in int vKind; in vec4 vPar; in float vLen;',
    'uniform float uTime;',
    'out vec4 o;',
    'float square(float x){ return x * x; }',
    'float h11(float n){ return fract(sin(n) * 43758.5453); }',
    'float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float vn2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);',
    '  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }',
    'void main(){',
    '  vec2 u = vUV; float x = u.x; float y = u.y;',   // x: 横向(-1..1), y: 纵向(-1..1)
    '  float ax = abs(x), ay = abs(y);',
    '  float a = 0.0; vec3 c = vCol.rgb;',
    '  if (vKind == 0) {',                  // 柔光点
    '    float r = length(u); a = exp(-r*r*3.2) * (1.0 - smoothstep(0.85, 1.0, r)) ;',
    '  } else if (vKind == 1) {',           // 能量弹：亮核+光晕+尾迹（y 为沿轴）
    '    float core = exp(-ax*ax*60.0) * smoothstep(-1.0, 0.1, y);',
    '    float halo = exp(-ax*ax*4.0) * (0.35 + 0.65*smoothstep(-1.0, 0.7, y));',
    '    float tail = (1.0 - smoothstep(-1.0, 1.0, -y)) * exp(-ax*ax*10.0) * 0.6;',
    '    a = core * 1.4 + halo * 0.45 + tail * (1.0 - smoothstep(0.0, 1.0, -y) * 0.0);',
    '    a *= (1.0 - smoothstep(0.92, 1.0, ay)); c = vCol.rgb * (0.7 + 0.8*core);',
    '  } else if (vKind == 2) {',           // 近防弹迹：细亮线
    '    float core = exp(-ax*ax*220.0);',
    '    float glow = exp(-ax*ax*18.0) * 0.4;',
    '    float fade = smoothstep(-1.0, 1.0, y) * 0.9 + 0.1;',
    '    a = (core + glow) * fade;',
    '  } else if (vKind == 3) {',           // 推进火焰（噪声团，y 向后拉长）
    '    float n = vn2(vec2(x*2.2 + vPar.y*13.0, y*1.6 - uTime*6.0 + vPar.y*5.0));',
    '    float r = length(vec2(x*1.0, (y*0.5+0.5)*0.0 + x*0.0 + y*0.0));',
    '    float rad = exp(-(x*x*3.0 + y*y*1.4));',
    '    a = rad * (0.45 + 0.9*n) * vPar.w;',
    '  } else if (vKind == 4) {',           // 爆闪：径向噪声团
    '    float r = length(u); float n = vn2(u*2.8 + vPar.y*11.0);',
    '    a = smoothstep(1.0, 0.0, r) * (0.5 + 0.8*n);',
    '  } else if (vKind == 5) {',           // 主光束：中央亮核、外侧辉光、流动条纹（y 沿束长 -1..1）',
    '    float core = exp(-ax*ax*vPar.z*4.0);',
    '    float glow = exp(-ax*ax*2.0) * 0.5;',
    '    float flow = 0.6 + 0.4*sin(y*vLen*0.05 - uTime*vPar.w*18.0 + vPar.y*6.0);',
    '    float streak = vn2(vec2(y*vLen*0.02 - uTime*3.0, x*3.0 + vPar.y));',
    '    float ends = smoothstep(-1.0, -0.94, y) * (1.0 - smoothstep(0.94, 1.0, y));',
    '    a = (core*1.5 + glow*0.9) * (0.7 + 0.5*flow*streak) * ends;',
    '  } else if (vKind == 6) {',           // 导弹尾迹：噪声条带、前亮后散
    '    float n = vn2(vec2(x*2.0 + vPar.y*9.0, y*3.0 - uTime*4.0));',
    '    float core = exp(-ax*ax*12.0);',
    '    a = (core*0.8 + 0.25*n*exp(-ax*ax*3.0)) * (1.0 - smoothstep(-1.0, 1.0, y)) * vPar.z;',
    '  } else if (vKind == 7) {',           // 火花/碎屑：小亮点
    '    float r = length(u); a = smoothstep(1.0, 0.0, r*r) ;',
    '  } else if (vKind == 8) {',           // 冲击环（面向相机的环带）
    '    float r = length(u); float ring = exp(-square((r - vPar.z)*12.0)) * vPar.w;',
    '    a = ring;',
    '  } else {',
    '    float r = length(u); a = exp(-r*r*3.0);',
    '  }',
    '  o = vec4(c * a * vCol.a, 1.0);',
    '}'
  ].join('\n');

  // 护盾：单位球代理，解析求交得到通透的壳层
  var SHIELD_VS = [
    '#version 300 es',
    'precision highp float;',
    'in vec3 aPos;',
    'uniform mat4 uModel; uniform mat4 uView; uniform mat4 uProj;',
    'out vec3 vL;',
    'void main(){ vL = aPos; gl_Position = uProj * uView * (uModel * vec4(aPos, 1.0)); }'
  ].join('\n');

  var SHIELD_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec3 vL; out vec4 o;',
    'float square(float x){ return x * x; }',
    'uniform vec3 uOrig; uniform vec3 uCol; uniform float uAmt; uniform float uTime; uniform float uWave; uniform float uBright; uniform float uSeed;',
    'float h31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }',
    'float vn(vec3 p){ vec3 i=floor(p); vec3 f=fract(p); f=f*f*(3.0-2.0*f);',
    '  float a=h31(i), b=h31(i+vec3(1,0,0)), c=h31(i+vec3(0,1,0)), d=h31(i+vec3(1,1,0));',
    '  float e=h31(i+vec3(0,0,1)), g=h31(i+vec3(1,0,1)), hh=h31(i+vec3(0,1,1)), k=h31(i+vec3(1,1,1));',
    '  return mix(mix(mix(a,b,f.x),mix(c,d,f.x),f.y), mix(mix(e,g,f.x),mix(hh,k,f.x),f.y), f.z); }',
    'void main(){',
    '  vec3 dir = normalize(vL - uOrig);',
    '  float b = dot(uOrig, dir); float c = dot(uOrig, uOrig) - 1.0;',
    '  float disc = b*b - c;',
    '  if (disc < 0.0) discard;',
    '  float t = -b - sqrt(disc);',
    '  vec3 p = uOrig + dir * t;',
    '  vec3 n = normalize(p);',
    '  float fr = pow(max(1.0 - abs(dot(n, -dir)), 1e-3), 3.0);',
    '  float tn = -b + sqrt(disc);',
    '  float thick = clamp((tn - t) * 0.5, 0.0, 1.0);',
    '  // 流动纹路与扩散波纹',
    '  float fl = vn(p * 4.0 + vec3(uTime * 0.35, -uTime * 0.2, uSeed));',
    '  float fl2 = vn(p * 9.0 - vec3(uTime * 0.9, 0.0, uSeed * 2.0));',
    '  float lines = smoothstep(0.62, 0.9, fl) * 0.7 + smoothstep(0.7, 0.95, fl2) * 0.45;',
    '  float wave = exp(-square((p.x - uWave) * 4.0)) * uBright;',
    '  // 碎片化弧线：未全开时只显示局部光纹',
    '  float arc = smoothstep(0.5 - uAmt*0.5, 0.52 - uAmt*0.5 + 0.02, vn(p*6.0 + uSeed) );',
    '  float amt = clamp(uAmt, 0.0, 1.0);',
    '  float a = (fr * 0.42 + lines * 0.28 + wave * 0.8) * amt * (0.4 + 0.6*arc);',
    '  a += smoothstep(0.9, 1.0, fr) * 0.35 * amt;',
    '  vec3 col = uCol * a * (1.0 + thick * 0.5) * 0.7;',
    '  o = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var COMP_VS = BG_VS;
  var COMP_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUV; out vec4 o;',
    'uniform sampler2D uScene; uniform sampler2D uBloom; uniform float uBloomK; uniform vec2 uInv;',
    'vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }',
    'void main(){',
    '  vec2 uv = vUV * 0.5 + 0.5;',
    '  vec3 c = texture(uScene, uv).rgb;',
    '  vec3 b = texture(uBloom, uv).rgb;',
    '  c += b * uBloomK;',
    '  vec2 q = uv - 0.5; float vig = 1.0 - dot(q, q) * 0.55;',
    '  c *= vig;',
    '  c = aces(c * 0.95);',
    '  c = pow(max(c, vec3(1e-5)), vec3(1.0/2.2));',
    '  o = vec4(c, 1.0);',
    '}'
  ].join('\n');

  var BLUR_FS = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vUV; out vec4 o;',
    'uniform sampler2D uSrc; uniform vec2 uDir; uniform int uThresh;',
    'void main(){',
    '  vec2 uv = vUV * 0.5 + 0.5;',
    '  vec3 s = vec3(0.0);',
    '  float w[5] = float[5](0.227, 0.1945, 0.1216, 0.054, 0.0162);',
    '  vec3 c0 = texture(uSrc, uv).rgb;',
    '  if (uThresh == 1) { float l = max(max(c0.r,c0.g),c0.b); c0 = c0 * smoothstep(0.7, 1.6, l); }',
    '  s = c0 * w[0];',
    '  for (int i = 1; i < 5; i++) {',
    '    vec2 off = uDir * float(i) * 1.6;',
    '    vec3 a = texture(uSrc, uv + off).rgb; vec3 b = texture(uSrc, uv - off).rgb;',
    '    if (uThresh == 1) { float la = max(max(a.r,a.g),a.b); a *= smoothstep(0.7,1.6,la); float lb = max(max(b.r,b.g),b.b); b *= smoothstep(0.7,1.6,lb); }',
    '    s += (a + b) * w[i];',
    '  }',
    '  o = vec4(s, 1.0);',
    '}'
  ].join('\n');

  // 与 VOXEL 共用的全屏三角形顶点着色器已在 BG_VS 中给出
  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('Shader compile: ' + gl.getShaderInfoLog(s) + '\n' + src.split('\n').map(function (l, i) { return (i + 1) + ': ' + l; }).join('\n'));
    }
    return s;
  }
  function program(name, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link ' + name + ': ' + gl.getProgramInfoLog(p));
    progs[name] = p;
    uniCache[name] = {};
    return p;
  }
  function U(prog, name, uni) {
    var c = uniCache[prog];
    if (!(name in c)) c[name] = gl.getUniformLocation(progs[prog], name);
    return c[name];
  }

  // 多重采样目标：只有 MSAA 颜色/深度渲染缓冲，解析到单采样纹理目标时使用
  function makeMsTarget(w, h, float, msN) {
    var t = { ms: true };
    var fmt = float ? gl.RGBA16F : gl.RGBA8;
    t.msFbo = gl.createFramebuffer();
    t.msRb = gl.createRenderbuffer();
    t.depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, t.msRb);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, msN, fmt, w, h);
    gl.bindRenderbuffer(gl.RENDERBUFFER, t.depth);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, msN, gl.DEPTH_COMPONENT24, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.msFbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, t.msRb);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, t.depth);
    t.w = w; t.h = h;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return t;
  }
  function makeTarget(w, h, float, msN) {
    if (msN > 1) return makeMsTarget(w, h, float, msN);
    var t = {};
    var fmt = float ? gl.RGBA16F : gl.RGBA8;
    var typ = float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    t.fbo = gl.createFramebuffer();
    t.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, gl.RGBA, typ, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
    t.depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, t.depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, t.depth);
    t.w = w; t.h = h;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return t;
  }
  function freeTarget(t) {
    if (!t) return;
    if (t.tex) gl.deleteTexture(t.tex);
    if (t.fbo) gl.deleteFramebuffer(t.fbo);
    if (t.ms) { gl.deleteRenderbuffer(t.msRb); gl.deleteFramebuffer(t.msFbo); }
    if (t.depth) gl.deleteRenderbuffer(t.depth);
  }

  function init(c) {
    canvas = c;
    gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL 2 不可用');
    var cbf = gl.getExtension('EXT_color_buffer_float');
    hdrOK = !!cbf;
    gl.getExtension('EXT_float_blend');
    var ms = gl.getParameter(gl.MAX_SAMPLES) || 1;
    samples = Math.min(4, ms);
    program('voxel', VOXEL_VS, VOXEL_FS);
    program('bg', BG_VS, BG_FS);
    program('star', STAR_VS, STAR_FS);
    program('part', PART_VS, PART_FS);
    program('shield', SHIELD_VS, SHIELD_FS);
    program('comp', COMP_VS, COMP_FS);
    program('blur', BG_VS, BLUR_FS);

    // 全屏三角形不需要顶点缓冲
    quadVAO = gl.createVertexArray();

    starVAO = gl.createVertexArray();
    starBuf = gl.createBuffer();
    partVAO = gl.createVertexArray();
    partBuf = gl.createBuffer();
    partData = new Float32Array(MAXP * 16);
    gl.bindVertexArray(partVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, partBuf);
    gl.bufferData(gl.ARRAY_BUFFER, partData.byteLength, gl.DYNAMIC_DRAW);
    var pl = progs.part;
    var stride = 64;
    [['aP0', 0], ['aP1', 16], ['aCol', 32], ['aPar', 48]].forEach(function (e) {
      var loc = gl.getAttribLocation(pl, e[0]);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, stride, e[1]);
      gl.vertexAttribDivisor(loc, 1);
    });
    gl.bindVertexArray(null);

    // 星点 VAO 在 setStars 中填充
    sphereMesh = makeSphere(20, 14);
    gl.bindVertexArray(null);
    return { hdr: hdrOK, samples: samples };
  }

  // ---------- 资源 ----------
  function uploadMesh(md) {
    var m = { nOpaque: md.nOpaque, nGlass: md.nGlass, nVerts: md.nVerts };
    m.vao = gl.createVertexArray();
    gl.bindVertexArray(m.vao);
    m.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, md.vertData, gl.STATIC_DRAW);
    m.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, md.idx, gl.STATIC_DRAW);
    var p = progs.voxel;
    var la = gl.getAttribLocation(p, 'aPos');
    var lm = gl.getAttribLocation(p, 'aMeta');
    var lc = gl.getAttribLocation(p, 'aCol');
    gl.enableVertexAttribArray(la);
    gl.vertexAttribPointer(la, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(lm);
    gl.vertexAttribIPointer(lm, 4, gl.UNSIGNED_BYTE, 20, 12);
    gl.enableVertexAttribArray(lc);
    gl.vertexAttribPointer(lc, 4, gl.UNSIGNED_BYTE, true, 20, 16);
    gl.bindVertexArray(null);
    return m;
  }
  function makeSphere(slices, stacks) {
    var pos = [], idx = [];
    for (var i = 0; i <= stacks; i++) {
      var th = Math.PI * i / stacks;
      for (var j = 0; j <= slices; j++) {
        var ph = 2 * Math.PI * j / slices;
        pos.push(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
      }
    }
    for (i = 0; i < stacks; i++) for (j = 0; j < slices; j++) {
      var a = i * (slices + 1) + j, b = a + slices + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
    var m = { n: idx.length };
    m.vao = gl.createVertexArray();
    gl.bindVertexArray(m.vao);
    m.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
    m.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    var ls = gl.getAttribLocation(progs.shield, 'aPos');
    gl.enableVertexAttribArray(ls);
    gl.vertexAttribPointer(ls, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null);
    return m;
  }
  function setStars(dirs, props) {
    // dirs: Float32Array(3n), props: Float32Array(4n)
    var n = dirs.length / 3;
    var inter = new Float32Array(n * 7);
    for (var i = 0; i < n; i++) {
      inter[i * 7] = dirs[i * 3]; inter[i * 7 + 1] = dirs[i * 3 + 1]; inter[i * 7 + 2] = dirs[i * 3 + 2];
      inter[i * 7 + 3] = props[i * 4]; inter[i * 7 + 4] = props[i * 4 + 1]; inter[i * 7 + 5] = props[i * 4 + 2]; inter[i * 7 + 6] = props[i * 4 + 3];
    }
    gl.bindVertexArray(starVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, starBuf);
    gl.bufferData(gl.ARRAY_BUFFER, inter, gl.STATIC_DRAW);
    var p = progs.star;
    var la = gl.getAttribLocation(p, 'aDir'), lb = gl.getAttribLocation(p, 'aStar');
    gl.enableVertexAttribArray(la); gl.vertexAttribPointer(la, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(lb); gl.vertexAttribPointer(lb, 4, gl.FLOAT, false, 28, 12);
    gl.bindVertexArray(null);
    starCount = n;
  }
  var starCount = 0;

  // ---------- 目标与尺寸 ----------
  function resize(w, h) {
    if (w === W && h === H && targets.scene) return;
    W = w; H = h;
    var fl = hdrOK;
    freeTarget(targets.scene); freeTarget(targets.res); freeTarget(targets.b1); freeTarget(targets.b2);
    targets.scene = makeTarget(W, H, fl, samples);
    targets.res = makeTarget(W, H, fl, 1);
    var bw = Math.max(16, W >> 2), bh = Math.max(16, H >> 2);
    targets.b1 = makeTarget(bw, bh, fl, 1);
    targets.b2 = makeTarget(bw, bh, fl, 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // ---------- 帧 ----------
  var cam = null;
  var sceneU = null;
  var lastSet = false;
  function beginFrame(c, sc) {
    cam = c; sceneU = sc;
    lastSet = false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, targets.scene.ms ? targets.scene.msFbo : targets.scene.fbo);
    gl.viewport(0, 0, W, H);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  function drawBackground(bg) {
    var p = progs.bg;
    gl.useProgram(p);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.disable(gl.BLEND);
    gl.uniform3fv(U('bg', 'uCamR'), cam.r);
    gl.uniform3fv(U('bg', 'uCamU'), cam.u);
    gl.uniform3fv(U('bg', 'uCamF'), cam.f);
    gl.uniform1f(U('bg', 'uTanY'), Math.tan(cam.fov / 2));
    gl.uniform1f(U('bg', 'uAspect'), W / H);
    gl.uniform3fv(U('bg', 'uSunDir'), sceneU.sunDir);
    gl.uniform1f(U('bg', 'uSunGlow'), bg.sunGlow);
    gl.uniform1f(U('bg', 'uNeb'), bg.neb);
    gl.uniform1f(U('bg', 'uTime'), bg.time);
    gl.uniform3fv(U('bg', 'uPlanP'), PLAN_P);
    gl.uniform3fv(U('bg', 'uPlanT'), PLAN_T);
    gl.uniform1f(U('bg', 'uPlanR'), 0.075);
    gl.bindVertexArray(quadVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // 星点
    if (starCount > 0) {
      gl.useProgram(progs.star);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.uniformMatrix4fv(U('star', 'uView'), false, cam.view);
      gl.uniformMatrix4fv(U('star', 'uProj'), false, cam.proj);
      gl.uniform1f(U('star', 'uPx'), H / 1080);
      gl.uniform1f(U('star', 'uTime'), bg.time);
      gl.bindVertexArray(starVAO);
      gl.drawArrays(gl.POINTS, 0, starCount);
    }
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
  }

  function setVoxelScene() {
    var p = progs.voxel;
    gl.useProgram(p);
    gl.uniformMatrix4fv(U('voxel', 'uView'), false, cam.view);
    gl.uniformMatrix4fv(U('voxel', 'uProj'), false, cam.proj);
    gl.uniform3fv(U('voxel', 'uSunDir'), sceneU.sunDir);
    gl.uniform3fv(U('voxel', 'uSunCol'), sceneU.sunCol);
    gl.uniform3fv(U('voxel', 'uSkyCol'), sceneU.skyCol);
    gl.uniform3fv(U('voxel', 'uGndCol'), sceneU.gndCol);
    gl.uniform3fv(U('voxel', 'uFogCol'), sceneU.fogCol);
    gl.uniform1f(U('voxel', 'uFogDen'), sceneU.fogDen);
    var n = sceneU.plights ? sceneU.plights.length : 0;
    gl.uniform1i(U('voxel', 'uPLCount'), n);
    var pp = new Float32Array(12), pc = new Float32Array(16);
    for (var i = 0; i < n; i++) {
      var L = sceneU.plights[i];
      pp.set([L.p[0] - cam.pos[0], L.p[1] - cam.pos[1], L.p[2] - cam.pos[2]], i * 3);
      pc.set([L.c[0], L.c[1], L.c[2], L.r], i * 4);
    }
    gl.uniform3fv(U('voxel', 'uPLPos'), pp);
    gl.uniform4fv(U('voxel', 'uPLCol'), pc);
    gl.uniform1f(U('voxel', 'uAlpha'), 1.0);
  }

  // 绘制体素网格。opt: {model, tint, emit, charge, thrust, glass(bool), alpha}
  function drawMesh(m, model, opt) {
    if (!lastSet) { setVoxelScene(); lastSet = true; }
    var p = progs.voxel;
    gl.useProgram(p);
    gl.uniformMatrix4fv(U('voxel', 'uModel'), false, model);
    var t = opt.tint || [1, 1, 1];
    gl.uniform3fv(U('voxel', 'uTint'), t);
    var ia = new Float32Array(16), ib = new Float32Array(16);
    var imps = opt.imp || [];
    for (var ii = 0; ii < 4; ii++) { var im = imps[ii]; if (im) { ia.set([im.p[0], im.p[1], im.p[2], im.s], ii * 4); ib.set([im.r, im.age, 0, 0], ii * 4); } }
    gl.uniform4fv(U('voxel', 'uImpA'), ia);
    gl.uniform4fv(U('voxel', 'uImpB'), ib);
    gl.uniform4fv(U('voxel', 'uParams'), [opt.emit === undefined ? 1 : opt.emit, opt.charge || 0, opt.thrust || 0, sceneU.time]);
    gl.uniform1f(U('voxel', 'uAlpha'), opt.alpha === undefined ? 1 : opt.alpha);
    gl.bindVertexArray(m.vao);
    if (opt.pass !== 'glass') {
      gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      if (m.nOpaque) gl.drawElements(gl.TRIANGLES, m.nOpaque, gl.UNSIGNED_INT, 0);
    } else if (m.nGlass) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      gl.drawElements(gl.TRIANGLES, m.nGlass, gl.UNSIGNED_INT, m.nOpaque * 4);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.enable(gl.CULL_FACE);
    }
  }
  function endVoxelBatch() { lastSet = false; }

  // 粒子：inst 为 Float32Array，每实例 16 个浮点（P0,P1,COL,PAR）
  function drawParticles(inst, count) {
    if (count <= 0) return;
    if (count > MAXP) count = MAXP;
    gl.useProgram(progs.part);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.uniformMatrix4fv(U('part', 'uView'), false, cam.view);
    gl.uniformMatrix4fv(U('part', 'uProj'), false, cam.proj);
    gl.uniform1f(U('part', 'uTime'), sceneU.time);
    gl.bindVertexArray(partVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, partBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, inst, 0, count * 16);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
  }

  // 护盾：model 为 T·R·S（相机相对），origin 为单位球空间中的相机位置
  function drawShield(model, origin, col, amt, wave, bright, seed, time) {
    gl.useProgram(progs.shield);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.uniformMatrix4fv(U('shield', 'uModel'), false, model);
    gl.uniformMatrix4fv(U('shield', 'uView'), false, cam.view);
    gl.uniformMatrix4fv(U('shield', 'uProj'), false, cam.proj);
    gl.uniform3fv(U('shield', 'uOrig'), origin);
    gl.uniform3fv(U('shield', 'uCol'), col);
    gl.uniform1f(U('shield', 'uAmt'), amt);
    gl.uniform1f(U('shield', 'uWave'), wave);
    gl.uniform1f(U('shield', 'uBright'), bright);
    gl.uniform1f(U('shield', 'uSeed'), seed);
    gl.uniform1f(U('shield', 'uTime'), time);
    gl.bindVertexArray(sphereMesh.vao);
    gl.drawElements(gl.TRIANGLES, sphereMesh.n, gl.UNSIGNED_SHORT, 0);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  function endFrame(bloomK) {
    var sc = targets.scene;
    // 解析多重采样
    if (sc.ms) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sc.msFbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, targets.res.fbo);
      gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    } else {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, sc.fbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, targets.res.fbo);
      gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(false);
    // 泛光：亮部提取 + 两次分离高斯
    gl.bindVertexArray(quadVAO);
    gl.useProgram(progs.blur);
    var b1 = targets.b1, b2 = targets.b2;
    gl.viewport(0, 0, b1.w, b1.h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, b1.fbo);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, targets.res.tex);
    gl.uniform1i(U('blur', 'uSrc'), 0);
    gl.uniform2f(U('blur', 'uDir'), 1.0 / b1.w, 0);
    gl.uniform1i(U('blur', 'uThresh'), 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.uniform1i(U('blur', 'uThresh'), 0);
    for (var pass = 0; pass < 2; pass++) {
      var sx = pass === 0 ? 1.0 / b1.w : 0, sy = pass === 0 ? 0 : 1.0 / b1.h;
      gl.bindFramebuffer(gl.FRAMEBUFFER, b2.fbo);
      gl.bindTexture(gl.TEXTURE_2D, b1.tex);
      gl.uniform2f(U('blur', 'uDir'), sx * 1.4, sy * 1.4);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, b1.fbo);
      gl.bindTexture(gl.TEXTURE_2D, b2.tex);
      gl.uniform2f(U('blur', 'uDir'), sx * 2.2, sy * 2.2);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    // 合成到画布
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(progs.comp);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, targets.res.tex);
    gl.uniform1i(U('comp', 'uScene'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, b1.tex);
    gl.uniform1i(U('comp', 'uBloom'), 1);
    gl.uniform1f(U('comp', 'uBloomK'), bloomK);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  return {
    init: init, resize: resize, uploadMesh: uploadMesh, setStars: setStars,
    beginFrame: beginFrame, drawBackground: drawBackground, drawMesh: drawMesh, endVoxelBatch: endVoxelBatch,
    drawParticles: drawParticles, drawShield: drawShield, endFrame: endFrame,
    gl: function () { return gl; }, progs: function () { return progs; }, MAXP: MAXP, partData: function () { return partData; },
    W: function () { return W; }, H: function () { return H; }
  };
})();
