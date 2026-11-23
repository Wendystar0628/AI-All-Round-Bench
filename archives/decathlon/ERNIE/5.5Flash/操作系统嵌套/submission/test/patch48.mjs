import fs from 'fs';
let k = fs.readFileSync('js/kernel.js', 'utf8');
k = k.replace(`    const dt = this.forceStep || this.isRoot ? this.stepMs : this.stepMs * (this.speed || 1);`, `    const dt = this.forceStep ? this.stepMs : this.stepMs * (this.parent?.speed || 1) * (this.speed || 1);`);
k = k.replace(`    const speed = root.speed || 1;
    this.acc += dt * speed;`, `    this.acc += dt;`);
fs.writeFileSync('js/kernel.js', k);
console.log('done');