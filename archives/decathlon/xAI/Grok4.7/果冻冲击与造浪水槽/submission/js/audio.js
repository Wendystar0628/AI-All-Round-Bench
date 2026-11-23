/* global JW */
var JW = JW || {};

JW.audio = (function () {
  var ctx = null;
  var master = null;
  var waveGain = null;
  var waveSrc = null;
  var enabled = true;
  var unlocked = false;
  var last = {};

  function ensure() {
    if (ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
    waveGain = ctx.createGain();
    waveGain.gain.value = 0;
    var filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 380;
    var bufferSize = 2 * ctx.sampleRate;
    var buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    var data = buf.getChannelData(0);
    var lastN = 0;
    for (var i = 0; i < bufferSize; i++) {
      var w = Math.random() * 2 - 1;
      lastN = lastN * 0.96 + w * 0.04;
      data[i] = lastN * 2.2;
    }
    waveSrc = ctx.createBufferSource();
    waveSrc.buffer = buf;
    waveSrc.loop = true;
    waveSrc.connect(filter);
    filter.connect(waveGain);
    waveGain.connect(master);
    waveSrc.start();
    return true;
  }

  function envGain(t, peak, dur, attack) {
    var g = ctx.createGain();
    var now = ctx.currentTime;
    g.connect(master);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), now + (attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    return g;
  }

  function noiseBurst(dur, peak, hp, lp) {
    if (!ensure() || !enabled || !unlocked) return;
    var n = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var g = envGain(0, peak, dur, 0.005);
    var node = src;
    if (hp) {
      var f1 = ctx.createBiquadFilter();
      f1.type = "highpass";
      f1.frequency.value = hp;
      node.connect(f1);
      node = f1;
    }
    if (lp) {
      var f2 = ctx.createBiquadFilter();
      f2.type = "lowpass";
      f2.frequency.value = lp;
      node.connect(f2);
      node = f2;
    }
    node.connect(g);
    src.start();
    src.stop(ctx.currentTime + dur + 0.02);
  }

  function tone(freq, freq2, dur, type, peak) {
    if (!ensure() || !enabled || !unlocked) return;
    var o = ctx.createOscillator();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (freq2) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq2), ctx.currentTime + dur);
    var g = envGain(0, peak, dur, 0.008);
    o.connect(g);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  function throttle(key, ms) {
    var n = performance.now();
    if (last[key] && n - last[key] < ms) return false;
    last[key] = n;
    return true;
  }

  return {
    unlock: function () {
      if (!ensure()) return;
      unlocked = true;
      if (ctx.state === "suspended") ctx.resume();
    },
    setEnabled: function (v) {
      enabled = v;
      if (waveGain && ctx) {
        waveGain.gain.setTargetAtTime(v ? waveGain.gain.value : 0, ctx.currentTime, 0.05);
      }
    },
    enabled: function () { return enabled; },
    impact: function (speed) {
      if (!throttle("impact", 70)) return;
      var s = JW.clamp(speed / 6, 0.15, 1);
      noiseBurst(0.18, 0.45 * s, 80, 900);
      tone(140 - 40 * s, 55, 0.22, "sine", 0.28 * s);
    },
    boing: function (amount) {
      if (!throttle("boing", 120)) return;
      var a = JW.clamp(amount, 0.1, 1);
      tone(220 * (1.2 - 0.4 * a), 90, 0.35, "sine", 0.16 * a);
    },
    crack: function () {
      noiseBurst(0.12, 0.55, 500, 4000);
      noiseBurst(0.22, 0.35, 200, 1800);
      tone(90, 40, 0.18, "triangle", 0.2);
    },
    collide: function (speed) {
      if (!throttle("col", 40)) return;
      var s = JW.clamp(speed / 4, 0.1, 1);
      noiseBurst(0.06, 0.28 * s, 300, 2500);
      tone(520, 240, 0.07, "triangle", 0.12 * s);
    },
    splash: function (speed) {
      if (!throttle("splash", 60)) return;
      var s = JW.clamp(speed / 5, 0.15, 1);
      noiseBurst(0.28 + 0.2 * s, 0.4 * s, 200, 2200);
      tone(180, 70, 0.16, "sine", 0.1 * s);
    },
    bubble: function () {
      if (!throttle("bub", 90)) return;
      tone(700 + Math.random() * 400, 1200, 0.08, "sine", 0.04);
    },
    setWave: function (energy) {
      if (!ensure() || !unlocked) return;
      var g = enabled ? JW.clamp(energy, 0, 1) * 0.22 : 0;
      waveGain.gain.setTargetAtTime(Math.max(0.0001, g), ctx.currentTime, 0.12);
    },
    suspendWave: function () {
      if (waveGain && ctx) waveGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
    }
  };
})();
