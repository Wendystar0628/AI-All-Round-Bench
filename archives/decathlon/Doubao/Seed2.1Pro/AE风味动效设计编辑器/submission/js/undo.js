/* ============================================================
 * undo.js — 撤销/重做：以事务为单位的工程快照
 * 一次完整拖动、输入或接线 = 一次 begin()/commit()
 * ============================================================ */
(function (global) {
'use strict';
function History(target, onRestore) {
  this.target = target;
  this.onRestore = onRestore;
  this.stack = [];
  this.index = -1;
  this.depth = 0;
  this.snapshot = null;
  this.limit = 80;
}
History.prototype._snap = function () { return JSON.stringify(this.target); };
History.prototype._restore = function (s) {
  const data = JSON.parse(s);
  Object.keys(this.target).forEach(k => { delete this.target[k]; });
  Object.assign(this.target, data);
  if (this.onRestore) this.onRestore();
};
History.prototype.begin = function () {
  if (this.depth === 0) this.snapshot = this._snap();
  this.depth++;
};
History.prototype.commit = function (label) {
  this.depth = Math.max(0, this.depth - 1);
  if (this.depth > 0) return;
  if (this.snapshot === null) return;
  const cur = this._snap();
  if (cur === this.snapshot) { this.snapshot = null; return; }
  if (this.index < this.stack.length - 1) this.stack.length = this.index + 1;
  this.stack.push({ label: label || '', before: this.snapshot, after: cur });
  if (this.stack.length > this.limit) this.stack.shift();
  this.index = this.stack.length - 1;
  this.snapshot = null;
  if (this.onRestore) this.onRestore(true);
};
History.prototype.cancel = function () {
  if (this.depth <= 1) {
    if (this.snapshot !== null && this._snap() !== this.snapshot) this._restore(this.snapshot);
    this.snapshot = null;
    this.depth = 0;
  } else this.depth--;
};
History.prototype.undo = function () {
  if (this.depth > 0) return;
  if (this.index < 0) return;
  this._restore(this.stack[this.index].before);
  this.index--;
};
History.prototype.redo = function () {
  if (this.depth > 0) return;
  if (this.index >= this.stack.length - 1) return;
  this.index++;
  this._restore(this.stack[this.index].after);
};
History.prototype.reset = function () {
  this.stack = []; this.index = -1; this.depth = 0; this.snapshot = null;
};
History.prototype.canUndo = function () { return this.index >= 0 && this.depth === 0; };
History.prototype.canRedo = function () { return this.index < this.stack.length - 1 && this.depth === 0; };

global.History = History;
})(window);
