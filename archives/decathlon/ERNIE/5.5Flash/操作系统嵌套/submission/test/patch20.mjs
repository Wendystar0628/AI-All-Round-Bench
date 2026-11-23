import fs from 'fs';
let s = fs.readFileSync('js/flight.js', 'utf8');
s = s.replace(`      const pitchAcc = c.pitch * 5.0 * auth - s.pitch * 1.0 - s.q * 0.55 + s.pitch * 0.6 + gust * 0.35;
      const rollAcc = c.roll * 5.0 * auth - s.roll * 1.0 - s.p * 0.55 + s.roll * 0.6 - gust * 0.3;`,
`      const pitchAcc = c.pitch * 5.0 * auth - s.q * 0.55 + s.pitch * 0.45 + gust * 0.35;
      const rollAcc = c.roll * 5.0 * auth - s.p * 0.55 + s.roll * 0.45 - gust * 0.3;`);
fs.writeFileSync('js/flight.js', s);
console.log('ok');