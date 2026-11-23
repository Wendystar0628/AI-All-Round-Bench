import fs from 'fs';
let s = fs.readFileSync('js/scene.js', 'utf8');
s = s.replace(`    const numMat = new THREE.MeshBasicMaterial({ map: numTex, transparent: true, side: THREE.DoubleSide, depthWrite: false });`,
`    const numMat = new THREE.MeshStandardMaterial({ map: numTex, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide, roughness: 0.38, metalness: 0.15, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });`);
// rotor scale
s = s.replace(`    const rotor = new THREE.Group();
    rotor.position.set(0, 1.78, 0.1);`,
`    const rotor = new THREE.Group();
    const rs = cfg.rotorScale ?? 1;
    rotor.position.set(0, 1.78, 0.1);`);
s = s.replace(`      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.045, 5.3), blackMat);
      blade.position.set(0, 0, 2.75);`,
`      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.045, 5.3 * rs), blackMat);
      blade.position.set(0, 0, 2.75 * rs);`);
s = s.replace(`      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.35), accentMat);
      tip.position.set(0, 0, 5.15);`,
`      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.35), accentMat);
      tip.position.set(0, 0, 5.15 * rs);`);
s = s.replace(`      new THREE.CircleGeometry(5.45, 48),`, `      new THREE.CircleGeometry(5.45 * rs, 48),`);
// tail scale
s = s.replace(`    const tail = new THREE.Group();
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.4, 4.5, 14), bodyMat);
    boom.rotation.x = Math.PI / 2; boom.position.set(0, 0.35, -3.35);`,
`    const tail = new THREE.Group();
    const tl = cfg.tailScale ?? 1;
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.4, 4.5 * tl, 14), bodyMat);
    boom.rotation.x = Math.PI / 2; boom.position.set(0, 0.35, -3.35 * tl);`);
s = s.replace(`    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.45, 0.95), bodyMat);
    fin.position.set(0, 1.05, -5.35);`, `    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.45, 0.95), bodyMat);
    fin.position.set(0, 1.05, -5.35 * tl);`);
s = s.replace(`    finTip.position.set(0, 1.62, -5.45);`, `    finTip.position.set(0, 1.62, -5.45 * tl);`);
s = s.replace(`    stab.position.set(0, 0.62, -4.65);`, `    stab.position.set(0, 0.62, -4.65 * tl);`);
s = s.replace(`    tailRotor.position.set(0.18, 1.05, -5.5);`, `    tailRotor.position.set(0.18, 1.05, -5.5 * tl);`);
fs.writeFileSync('js/scene.js', s);
console.log('scene patched');