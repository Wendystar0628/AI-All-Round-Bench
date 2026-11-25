"use strict";
// The yard is lit in pools. The long-distance tungsten sources need no shadow atlas.
const yardSources = [],
  yardTints = [];
for (let l of pinLights) {
  if (l.blink !== 0 || l.v.y < 37 || l.v.z < -155) continue;
  if (yardSources.some((p) => p.distanceTo(l.v) < 13.8)) continue;
  yardSources.push(l.v.clone().add(V(0, -0.5, 0)));
  yardTints.push(l.col.clone().multiplyScalar(1.7));
}
yardSources.push(V(-80, 41, -22), V(-39, 30, -33));
yardTints.push(new T.Color(2.8, 1.17, 0.38), new T.Color(2, 0.91, 0.28));
function localFloodlights(mat) {
  const before = mat.onBeforeCompile.bind(mat),
    oldKey = mat.customProgramCacheKey();
  mat.envMapIntensity = 0.3;
  mat.onBeforeCompile = (shader) => {
    before(shader);
    shader.uniforms.yardPositions = { value: yardSources };
    shader.uniforms.yardLamps = { value: yardTints };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vYardP;varying vec3 vYardN;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvYardP=(modelMatrix*vec4(position,1.)).xyz;vYardN=normalize(mat3(modelMatrix)*normal);"
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform vec3 yardPositions[` +
          yardSources.length +
          `],yardLamps[` +
          yardSources.length +
          `];varying vec3 vYardP;varying vec3 vYardN;`
      )
      .replace(
        "#include <opaque_fragment>",
        `
vec3 paintIllum=vec3(0.),lampSpec=vec3(0.);vec3 yardE=normalize(cameraPosition-vYardP),yardN=normalize(vYardN);
for(int lightIndex=0;lightIndex<` +
          yardSources.length +
          `;lightIndex++){
 vec3 delta=yardPositions[lightIndex]-vYardP;float distSq=max(.61,dot(delta,delta));
 vec3 L=delta*inversesqrt(distSq);float diffuse=max(0.,dot(yardN,L));
 float fade=1.-smoothstep(2300.,5500.,distSq);float energy=fade*26./(15.+distSq*.37);
 paintIllum+=yardLamps[lightIndex]*energy*(.068+.932*diffuse);
 lampSpec+=yardLamps[lightIndex]*energy*pow(max(0.,dot(yardN,normalize(L+yardE))),49.)*.36;
}
outgoingLight=outgoingLight*.34+diffuseColor.rgb*paintIllum+lampSpec;
#include <opaque_fragment>`
      );
  };
  mat.customProgramCacheKey = () => oldKey + "-berth";
}
for (let m of new Set([...Object.values(H), ...intermodal]))
  if (m.isMeshStandardMaterial) localFloodlights(m);
for (let i = 0; i < yardSources.length - 2; i++) {
  const p = yardSources[i],
    col = yardTints[i];
  if (i % 2 === 1) continue;
  halo(scene, p.x, p.y, p.z, 23.5, col.r > col.b ? 0xff9956 : 0xa6c4db, 0.22);
}
scene.fog.color.set(0x293b49);
scene.fog.density = 0.0041;
