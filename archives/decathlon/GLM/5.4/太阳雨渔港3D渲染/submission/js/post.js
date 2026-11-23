/* ============================================================
   post.js — 后期：泛光 / 调色 / 暗角
   ============================================================ */
(function (global) {
  'use strict';
  const S = global.S;

  S.Post = function (renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    const size = new THREE.Vector2();
    renderer.getSize(size);
    const pr = renderer.getPixelRatio();

    this.rtScene = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat
    });
    this.rtScene.texture.encoding = THREE.sRGBEncoding;
    this.rtBright = new THREE.WebGLRenderTarget(size.x * pr / 4, size.y * pr / 4, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat
    });
    this.rtBlurA = new THREE.WebGLRenderTarget(size.x * pr / 4, size.y * pr / 4, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat
    });
    this.rtBlurB = new THREE.WebGLRenderTarget(size.x * pr / 4, size.y * pr / 4, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat
    });

    const quadGeo = new THREE.PlaneGeometry(2, 2);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(quadGeo, null);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);

    const vs = `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

    this.matBright = new THREE.ShaderMaterial({
      uniforms: { tScene: { value: null }, uThresh: { value: 0.80 }, uKnee: { value: 0.30 } },
      vertexShader: vs,
      fragmentShader: `
        uniform sampler2D tScene; uniform float uThresh; uniform float uKnee;
        varying vec2 vUv;
        void main(){
          vec3 c = texture2D( tScene, vUv ).rgb;
          float l = dot( c, vec3(0.299,0.587,0.114) );
          float s = smoothstep( uThresh, uThresh + uKnee, l );
          gl_FragColor = vec4( c * s, 1.0 );
        }`,
      depthTest: false, depthWrite: false
    });

    const blurFrag = `
      uniform sampler2D tSrc; uniform vec2 uDir;
      varying vec2 vUv;
      void main(){
        vec3 sum = vec3(0.0);
        float w[5];
        w[0]=0.227027; w[1]=0.1945946; w[2]=0.1216216; w[3]=0.054054; w[4]=0.016216;
        sum += texture2D( tSrc, vUv ).rgb * w[0];
        for ( int i = 1; i < 5; i ++ ) {
          vec2 o = uDir * float(i) * 1.6;
          sum += texture2D( tSrc, vUv + o ).rgb * w[i];
          sum += texture2D( tSrc, vUv - o ).rgb * w[i];
        }
        gl_FragColor = vec4( sum, 1.0 );
      }`;
    this.matBlurH = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2(1 / 320, 0) } },
      vertexShader: vs, fragmentShader: blurFrag, depthTest: false, depthWrite: false
    });
    this.matBlurV = new THREE.ShaderMaterial({
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2(0, 1 / 320) } },
      vertexShader: vs, fragmentShader: blurFrag, depthTest: false, depthWrite: false
    });

    this.matComposite = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        uBloom: { value: 0.30 },
        uSat: { value: 1.34 },
        uVig: { value: 0.30 },
        uTime: { value: 0 },
        uAspect: { value: 1.78 }
      },
      vertexShader: vs,
      fragmentShader: `
        uniform sampler2D tScene; uniform sampler2D tBloom;
        uniform float uBloom; uniform float uSat; uniform float uVig; uniform float uTime; uniform float uAspect;
        varying vec2 vUv;
        float hash(vec2 p){ return fract( sin( dot( p, vec2(12.9898,78.233) ) ) * 43758.5453 ); }
        void main(){
          vec3 c = texture2D( tScene, vUv ).rgb;
          vec3 b = texture2D( tBloom, vUv ).rgb;
          c += b * uBloom;
          // 调色：提高饱和度
          float l = dot( c, vec3(0.299,0.587,0.114) );
          c = mix( vec3( l ), c, uSat );
          // 高光偏暖、暗部偏青
          c += vec3( 0.022, 0.012, -0.008 ) * smoothstep( 0.55, 1.0, l );
          c += vec3( -0.012, 0.010, 0.024 ) * ( 1.0 - smoothstep( 0.0, 0.45, l ) );
          // 轻微的整体提亮 + 柔和对比
          c = c * 1.02 + 0.006;
          c = ( c - 0.5 ) * 1.07 + 0.5;
          c = clamp( c, 0.0, 1.0 );
          // 暗角
          vec2 d = ( vUv - 0.5 ) * vec2( uAspect, 1.0 );
          float vig = 1.0 - dot( d, d ) * uVig;
          c *= vig;
          // 抖动去带
          c += ( hash( vUv * 1024.0 + uTime ) - 0.5 ) * 0.006;
          gl_FragColor = vec4( c, 1.0 );
        }`,
      depthTest: false, depthWrite: false
    });

    this.enabled = true;
  };

  S.Post.prototype.setSize = function (w, h, pr) {
    this.rtScene.setSize(w * pr, h * pr);
    this.rtBright.setSize(Math.max(2, w * pr / 4), Math.max(2, h * pr / 4));
    this.rtBlurA.setSize(Math.max(2, w * pr / 4), Math.max(2, h * pr / 4));
    this.rtBlurB.setSize(Math.max(2, w * pr / 4), Math.max(2, h * pr / 4));
    this.matBlurH.uniforms.uDir.value.set(1 / (w * pr / 4), 0);
    this.matBlurV.uniforms.uDir.value.set(0, 1 / (h * pr / 4));
    this.matComposite.uniforms.uAspect.value = w / h;
  };

  S.Post.prototype.render = function () {
    const r = this.renderer;
    if (!this.enabled) { r.render(this.scene, this.camera); return; }

    // 1. scene -> rtScene
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(this.scene, this.camera);

    // 2. bright
    this.quad.material = this.matBright;
    this.matBright.uniforms.tScene.value = this.rtScene.texture;
    r.setRenderTarget(this.rtBright);
    r.clear();
    r.render(this.quadScene, this.quadCam);

    // 3. blur H
    this.quad.material = this.matBlurH;
    this.matBlurH.uniforms.tSrc.value = this.rtBright.texture;
    r.setRenderTarget(this.rtBlurA);
    r.clear();
    r.render(this.quadScene, this.quadCam);

    // 4. blur V
    this.quad.material = this.matBlurV;
    this.matBlurV.uniforms.tSrc.value = this.rtBlurA.texture;
    r.setRenderTarget(this.rtBlurB);
    r.clear();
    r.render(this.quadScene, this.quadCam);

    // 5. composite
    this.quad.material = this.matComposite;
    this.matComposite.uniforms.tScene.value = this.rtScene.texture;
    this.matComposite.uniforms.tBloom.value = this.rtBlurB.texture;
    r.setRenderTarget(null);
    r.clear();
    r.render(this.quadScene, this.quadCam);
  };

})(window);
