// Multi-Pass Anime Renderer:
// 1. Planar Reflection Render Targets (Harbor Water y=0 & Foreground Puddle y=DECK_Y)
// 2. Normal + Hardware Depth Pre-Pass for Resolution-Independent Slender Anime Ink Outlines
// 3. WebGL2 MSAA Main Color Pass
// 4. Quarter-Res Soft Sunlit Watercolor Bloom + Composite Pass (Sobel Outlines + High-Key Grading)
(function () {
  const { WATER_Y, DECK_Y } = window.HARBOR;

  function createAnimePipeline(renderer, scene, camera, waterRef) {
    renderer.localClippingEnabled = true;

    let rtW = 1280;
    let rtH = 720;

    // Reflection RTs (crisp yet fast)
    const waterRefRT = new THREE.WebGLRenderTarget(1024, 1024, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.UnsignedByteType
    });
    const puddleRefRT = new THREE.WebGLRenderTarget(512, 512, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.UnsignedByteType
    });

    // Normal + Hardware Depth Pre-Pass RT
    const depthTex = new THREE.DepthTexture(rtW, rtH);
    depthTex.type = THREE.UnsignedIntType;
    const normalDepthRT = new THREE.WebGLRenderTarget(rtW, rtH, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.HalfFloatType,
      depthTexture: depthTex
    });

    // Main Scene Color RT (WebGL2 MSAA!)
    const isWebGL2 = renderer.capabilities.isWebGL2;
    const mainRT = new THREE.WebGLRenderTarget(rtW, rtH, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
      samples: isWebGL2 ? 4 : 0
    });

    // Quarter-Res Separable Sunlit Watercolor Bloom RTs
    const bloomRT1 = new THREE.WebGLRenderTarget(320, 180, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType
    });
    const bloomRT2 = new THREE.WebGLRenderTarget(320, 180, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType
    });

    // View-space Normal Override Material (supports regular & InstancedMesh!)
    const normalOverrideMat = new THREE.MeshNormalMaterial({
      side: THREE.DoubleSide
    });

    // Full-screen post-processing quad scene
    const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quadGeo = new THREE.PlaneGeometry(2, 2);

    // Bloom Extract + Horizontal Blur
    const bloomExtractMat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: mainRT.texture },
        uTexel: { value: new THREE.Vector2(1 / 320, 1 / 180) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: `
        uniform sampler2D tColor;
        uniform vec2 uTexel;
        varying vec2 vUv;
        vec3 brightSample(vec2 uv) {
          vec3 c = texture2D(tColor, uv).rgb;
          float lum = dot(c, vec3(0.299, 0.587, 0.114));
          // Extract only genuine warm-bright sun glints, god-rays & lightbox glow (never blow out sky/concrete!)
          float k = smoothstep(0.95, 1.65, lum);
          return c * k;
        }
        void main() {
          vec3 sum = brightSample(vUv) * 0.227;
          sum += (brightSample(vUv + vec2(uTexel.x * 1.5, 0.0)) + brightSample(vUv - vec2(uTexel.x * 1.5, 0.0))) * 0.194;
          sum += (brightSample(vUv + vec2(uTexel.x * 3.5, 0.0)) + brightSample(vUv - vec2(uTexel.x * 3.5, 0.0))) * 0.121;
          sum += (brightSample(vUv + vec2(uTexel.x * 5.5, 0.0)) + brightSample(vUv - vec2(uTexel.x * 5.5, 0.0))) * 0.071;
          gl_FragColor = vec4(sum, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false
    });

    // Bloom Vertical Blur
    const bloomVertMat = new THREE.ShaderMaterial({
      uniforms: {
        tBloom: { value: bloomRT1.texture },
        uTexel: { value: new THREE.Vector2(1 / 320, 1 / 180) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: `
        uniform sampler2D tBloom;
        uniform vec2 uTexel;
        varying vec2 vUv;
        void main() {
          vec3 sum = texture2D(tBloom, vUv).rgb * 0.227;
          sum += (texture2D(tBloom, vUv + vec2(0.0, uTexel.y * 1.5)).rgb + texture2D(tBloom, vUv - vec2(0.0, uTexel.y * 1.5)).rgb) * 0.194;
          sum += (texture2D(tBloom, vUv + vec2(0.0, uTexel.y * 3.5)).rgb + texture2D(tBloom, vUv - vec2(0.0, uTexel.y * 3.5)).rgb) * 0.121;
          sum += (texture2D(tBloom, vUv + vec2(0.0, uTexel.y * 5.5)).rgb + texture2D(tBloom, vUv - vec2(0.0, uTexel.y * 5.5)).rgb) * 0.071;
          gl_FragColor = vec4(sum, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false
    });

    // Final Anime Composite Shader: Crisp Slender Depth+Normal Ink Outlines + Soft Watercolor Bloom + High-Key Grading
    const compositeMat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: mainRT.texture },
        tNormal: { value: normalDepthRT.texture },
        tDepth: { value: depthTex },
        tBloom: { value: bloomRT2.texture },
        uResolution: { value: new THREE.Vector2(rtW, rtH) },
        uCameraNear: { value: camera.near },
        uCameraFar: { value: camera.far }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: `
        uniform sampler2D tColor;
        uniform sampler2D tNormal;
        uniform sampler2D tDepth;
        uniform sampler2D tBloom;
        uniform vec2 uResolution;
        uniform float uCameraNear;
        uniform float uCameraFar;
        varying vec2 vUv;

        float linearizeDepth(float d) {
          float z = d * 2.0 - 1.0;
          return (2.0 * uCameraNear * uCameraFar) / (uCameraFar + uCameraNear - z * (uCameraFar - uCameraNear));
        }

        void main() {
          vec3 sceneCol = texture2D(tColor, vUv).rgb;
          vec3 bloomCol = texture2D(tBloom, vUv).rgb;

          // Resolution-independent slender 1.0px-equivalent outline step (scales gracefully from 720p up to 4K!)
          float scalePx = clamp(min(uResolution.x, uResolution.y) / 960.0, 0.85, 2.35);
          vec2 texel = (vec2(1.0) / uResolution) * scalePx;

          // Sample center & 4-neighbor depth + normals for ultra-clean slender anime linework
          float dC = linearizeDepth(texture2D(tDepth, vUv).r);
          float dL = linearizeDepth(texture2D(tDepth, vUv - vec2(texel.x, 0.0)).r);
          float dR = linearizeDepth(texture2D(tDepth, vUv + vec2(texel.x, 0.0)).r);
          float dU = linearizeDepth(texture2D(tDepth, vUv + vec2(0.0, texel.y)).r);
          float dD = linearizeDepth(texture2D(tDepth, vUv - vec2(0.0, texel.y)).r);

          // Relative depth silhouette edge (only outlines foreground diorama objects, NOT distant sky/mist!)
          float minD = min(dC, min(min(dL, dR), min(dU, dD)));
          float depthGrad = (abs(dL - dR) + abs(dU - dD)) / max(minD * 0.14, 0.45);
          float edgeDepth = smoothstep(0.42, 0.92, depthGrad);

          // View-space normal crease edge (catches architectural corners, crates, cabin frames, roof ridges!)
          vec3 nL = texture2D(tNormal, vUv - vec2(texel.x, 0.0)).rgb * 2.0 - 1.0;
          vec3 nR = texture2D(tNormal, vUv + vec2(texel.x, 0.0)).rgb * 2.0 - 1.0;
          vec3 nU = texture2D(tNormal, vUv + vec2(0.0, texel.y)).rgb * 2.0 - 1.0;
          vec3 nD = texture2D(tNormal, vUv - vec2(0.0, texel.y)).rgb * 2.0 - 1.0;
          float normGrad = length(nL - nR) + length(nU - nD);
          float edgeNorm = smoothstep(0.72, 1.38, normGrad);

          // Distance fade: keep far distant breakwater & sky outline-free and airy!
          float distFade = 1.0 - smoothstep(32.0, 62.0, minD);
          float edge = clamp(max(edgeDepth, edgeNorm * 0.72), 0.0, 1.0) * distFade;

          // Colored anime teal-slate ink (crisp, slender illustration linework)
          vec3 inkColor = mix(vec3(0.08, 0.20, 0.27), sceneCol * 0.30, 0.42);
          vec3 col = mix(sceneCol, inkColor, edge * 0.62);

          // Add delicate sunlit watercolor bloom
          col += bloomCol * 0.22;

          // Balanced high-key Japanese anime watercolor tone mapping (preserves sea-glass cyan, deep teal shadows & warm-gold highlights!)
          col *= 0.92;
          // Gentle Reinhard highlight shoulder (no excessive shadow washout!)
          vec3 mapped = col / (vec3(1.0) + col * 0.42) * 1.18;
          // Preserve vibrant sea-glass cyan & warm accents slightly
          float luma = dot(mapped, vec3(0.299, 0.587, 0.114));
          mapped = mix(vec3(luma), mapped, 1.12);

          // Linear -> sRGB display encoding
          mapped = clamp(mapped, 0.0, 1.0);
          mapped = pow(mapped, vec3(1.0 / 2.2));
          gl_FragColor = vec4(mapped, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false
    });

    const postScene = new THREE.Scene();
    const postQuad = new THREE.Mesh(quadGeo, compositeMat);
    postScene.add(postQuad);

    // Reusable mirrored camera for planar reflections
    const mirrorCam = new THREE.PerspectiveCamera();
    const waterClipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -WATER_Y + 0.02);
    const puddleClipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DECK_Y + 0.02);
    const tmpFwd = new THREE.Vector3();
    const tmpLook = new THREE.Vector3();

    function syncMirrorCamera(planeY) {
      mirrorCam.fov = camera.fov;
      mirrorCam.aspect = camera.aspect;
      mirrorCam.near = camera.near;
      mirrorCam.far = camera.far;
      mirrorCam.updateProjectionMatrix();

      camera.getWorldDirection(tmpFwd);
      tmpLook.copy(camera.position).add(tmpFwd);

      mirrorCam.position.set(camera.position.x, 2 * planeY - camera.position.y, camera.position.z);
      tmpLook.y = 2 * planeY - tmpLook.y;
      mirrorCam.up.set(0, 1, 0);
      mirrorCam.lookAt(tmpLook);
      mirrorCam.updateMatrixWorld(true);
    }

    // Collect transparent / FX / water / sky meshes lazily for clean hiding during normal+depth & reflection passes
    function setCategoryVisibility(predicate, visible, savedList) {
      if (!visible) {
        scene.traverse((obj) => {
          if (obj.isMesh && obj.visible) {
            const m = obj.material;
            const hit = Array.isArray(m) ? m.some(predicate) : predicate(m);
            if (hit) {
              obj.visible = false;
              savedList.push(obj);
            }
          }
        });
      } else {
        for (let i = 0; i < savedList.length; i++) {
          savedList[i].visible = true;
        }
        savedList.length = 0;
      }
    }

    function isWaterMat(m) { return !!(m && m.userData && m.userData.isWater); }
    function isNonOutlineMat(m) {
      if (!m) return false;
      const ud = m.userData || {};
      return !!(ud.isWater || ud.isFX || ud.isSky || ud.isGlass || m.transparent);
    }

    const hiddenRef = [];
    const hiddenPre = [];

    function resize(width, height, dpr) {
      const effDpr = Math.min(dpr || 1, width >= 2560 ? 1 : 2);
      rtW = Math.max(1, Math.floor(width * effDpr));
      rtH = Math.max(1, Math.floor(height * effDpr));

      normalDepthRT.setSize(rtW, rtH);
      mainRT.setSize(rtW, rtH);

      const bw = Math.max(64, Math.floor(rtW * 0.25));
      const bh = Math.max(64, Math.floor(rtH * 0.25));
      bloomRT1.setSize(bw, bh);
      bloomRT2.setSize(bw, bh);

      bloomExtractMat.uniforms.uTexel.value.set(1 / bw, 1 / bh);
      bloomVertMat.uniforms.uTexel.value.set(1 / bw, 1 / bh);
      compositeMat.uniforms.uResolution.value.set(rtW, rtH);
      compositeMat.uniforms.uCameraNear.value = camera.near;
      compositeMat.uniforms.uCameraFar.value = camera.far;
    }

    function render() {
      compositeMat.uniforms.uCameraNear.value = camera.near;
      compositeMat.uniforms.uCameraFar.value = camera.far;

      // -----------------------------------------------------------------------
      // PASS 1: Planar Reflections (Harbor Water y=0 & Quay Puddle y=DECK_Y)
      // -----------------------------------------------------------------------
      setCategoryVisibility(isWaterMat, false, hiddenRef);

      // 1A. Harbor water reflection (only if camera is above water!)
      if (camera.position.y > WATER_Y + 0.05) {
        syncMirrorCamera(WATER_Y);
        renderer.clippingPlanes = [waterClipPlane];
        renderer.setRenderTarget(waterRefRT);
        renderer.clear();
        renderer.render(scene, mirrorCam);
      }

      // 1B. Foreground quay puddle reflection (only if camera is above deck!)
      if (camera.position.y > DECK_Y + 0.05) {
        syncMirrorCamera(DECK_Y);
        renderer.clippingPlanes = [puddleClipPlane];
        renderer.setRenderTarget(puddleRefRT);
        renderer.clear();
        renderer.render(scene, mirrorCam);
      }

      renderer.clippingPlanes = [];
      setCategoryVisibility(isWaterMat, true, hiddenRef);

      if (waterRef) {
        waterRef.setReflectionTextures(waterRefRT.texture, puddleRefRT.texture);
      }

      // -----------------------------------------------------------------------
      // PASS 2: Opaque View-Normal + Hardware Depth Pre-Pass for Anime Outlines
      // -----------------------------------------------------------------------
      setCategoryVisibility(isNonOutlineMat, false, hiddenPre);
      const prevOverride = scene.overrideMaterial;
      scene.overrideMaterial = normalOverrideMat;
      renderer.setRenderTarget(normalDepthRT);
      renderer.setClearColor(0x8080ff, 1.0);
      renderer.clear();
      renderer.render(scene, camera);
      scene.overrideMaterial = prevOverride;
      setCategoryVisibility(isNonOutlineMat, true, hiddenPre);

      // -----------------------------------------------------------------------
      // PASS 3: Main Full-Color WebGL2 MSAA Scene Pass
      // -----------------------------------------------------------------------
      renderer.setRenderTarget(mainRT);
      renderer.setClearColor(0xdcf4f7, 1.0);
      renderer.clear();
      renderer.render(scene, camera);

      // -----------------------------------------------------------------------
      // PASS 4: Quarter-Res Sunlit Watercolor Bloom (Horizontal + Vertical)
      // -----------------------------------------------------------------------
      postQuad.material = bloomExtractMat;
      renderer.setRenderTarget(bloomRT1);
      renderer.render(postScene, postCam);

      postQuad.material = bloomVertMat;
      renderer.setRenderTarget(bloomRT2);
      renderer.render(postScene, postCam);

      // -----------------------------------------------------------------------
      // PASS 5: Final Composite to Screen (Slender Ink Outlines + Bloom + Grading)
      // -----------------------------------------------------------------------
      postQuad.material = compositeMat;
      renderer.setRenderTarget(null);
      renderer.render(postScene, postCam);
    }

    return { resize, render };
  }

  window.HARBOR_POST = { createAnimePipeline };
})();
