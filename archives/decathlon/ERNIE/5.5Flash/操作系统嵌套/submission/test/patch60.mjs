import fs from 'fs';
let s = fs.readFileSync('js/lang.js', 'utf8');
s = s.replace(`    if (this.pendingPush !== undefined) {
      this.stack.push(this.pendingPush);
      this.pendingPush = undefined;
    }`, `    if (this.pendingPush !== undefined) {
      if (sys.debugService) console.log('DBG push pending', this.name, this.pendingPush, 'pc', this.pc);
      this.stack.push(this.pendingPush);
      this.pendingPush = undefined;
    }`);
s = s.replace(`            const r = sys.syscall(name, args, this);`, `            const r = sys.syscall(name, args, this);
            if (sys.debugService && (name === 'service' || name === 'service_reply')) console.log('DBG call', this.name, name, JSON.stringify(args), '->', JSON.stringify(r));`);
s = s.replace(`          case 'store': {
            const v = this.stack.pop();
            this.vars[ins.args[0]] = v;
            break;
          }`, `          case 'store': {
            const v = this.stack.pop();
            if (sys.debugService) console.log('DBG store', this.name, ins.args[0], v);
            this.vars[ins.args[0]] = v;
            break;
          }`);
fs.writeFileSync('js/lang.js', s);
console.log('done');