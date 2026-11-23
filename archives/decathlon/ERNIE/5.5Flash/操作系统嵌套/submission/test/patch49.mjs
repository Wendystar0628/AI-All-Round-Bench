import fs from 'fs';
let k = fs.readFileSync('js/kernel.js', 'utf8');
k = k.replace(`    const dt = this.forceStep ? this.stepMs : this.stepMs * (this.parent?.speed || 1) * (this.speed || 1);`, `    let speedProduct = 1;
    let walk = this;
    while (walk) { speedProduct *= (walk.speed || 1); walk = walk.parent; }
    const dt = this.forceStep ? this.stepMs : this.stepMs * speedProduct;`);
fs.writeFileSync('js/kernel.js', k);
console.log('done');