/* ================= 程序化音频（WebAudio 合成） ================= */
G.Audio = (function(){
'use strict';
var ctx=null, master=null, musicGain=null, ambGain=null, muted=false, vol=0.7;
var musicTimer=null, ambNodes=[], started=false, mapTheme=0;

function ensure(){
  if(ctx)return true;
  try{
    ctx = new (window.AudioContext||window.webkitAudioContext)();
    master=ctx.createGain();master.gain.value=vol;master.connect(ctx.destination);
    musicGain=ctx.createGain();musicGain.gain.value=.28;musicGain.connect(master);
    ambGain=ctx.createGain();ambGain.gain.value=.5;ambGain.connect(master);
  }catch(e){return false;}
  return true;
}
function resume(){ if(ctx && ctx.state==='suspended')ctx.resume(); }
document.addEventListener('pointerdown',function(){ if(ensure())resume(); },{once:false});
document.addEventListener('keydown',function(){ if(ensure())resume(); },{once:false});

/* 基础音 */
function tone(freq,dur,type,gain,when,slideTo){
  if(!ctx)return; when=when||ctx.currentTime;
  var o=ctx.createOscillator(),g=ctx.createGain();
  o.type=type||'sine';o.frequency.setValueAtTime(freq,when);
  if(slideTo)o.frequency.exponentialRampToValueAtTime(Math.max(20,slideTo),when+dur);
  g.gain.setValueAtTime(0,when);
  g.gain.linearRampToValueAtTime(gain,when+0.008);
  g.gain.exponentialRampToValueAtTime(0.0001,when+dur);
  o.connect(g);g.connect(master);o.start(when);o.stop(when+dur+.05);
}
function noise(dur,gainVal,freq,q,when){
  if(!ctx)return; when=when||ctx.currentTime;
  var len=Math.floor(ctx.sampleRate*dur),buf=ctx.createBuffer(1,len,ctx.sampleRate),d=buf.getChannelData(0);
  for(var i=0;i<len;i++)d[i]=(Math.random()*2-1)*(1-i/len);
  var src=ctx.createBufferSource();src.buffer=buf;
  var f=ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=freq||800;f.Q.value=q||1;
  var g=ctx.createGain();g.gain.value=gainVal;
  src.connect(f);f.connect(g);g.connect(master);src.start(when);
}

var SFX = {
  shoot:function(){tone(880+Math.random()*120,.08,'square',.05,undefined,420);},
  shootBig:function(){tone(320,.16,'sawtooth',.08,undefined,140);noise(.12,.05,2000,2);},
  pierce:function(){tone(1400,.18,'sawtooth',.06,undefined,300);},
  hit:function(){noise(.05,.04,1600,2);},
  explode:function(){noise(.35,.18,220,.8);tone(90,.3,'sine',.12,undefined,40);},
  wormHit:function(){noise(.09,.07,300,2);tone(140,.08,'square',.05,undefined,90);},
  build:function(){tone(300,.09,'triangle',.09);tone(450,.12,'triangle',.08,ctx.currentTime+.07);tone(600,.14,'triangle',.06,ctx.currentTime+.14);},
  sell:function(){tone(500,.1,'triangle',.07,undefined,250);},
  upgrade:function(){tone(400,.08,'triangle',.08);tone(600,.08,'triangle',.08,ctx.currentTime+.08);tone(900,.16,'triangle',.08,ctx.currentTime+.16);},
  seal:function(){tone(160,.3,'sawtooth',.1,undefined,70);noise(.25,.08,400,1);},
  unseal:function(){tone(220,.25,'sine',.07,undefined,500);},
  encrypt:function(){tone(2000,.25,'sine',.05,undefined,1100);},
  heal:function(){tone(660,.18,'sine',.05,undefined,990);},
  shield:function(){tone(500,.3,'triangle',.07,undefined,750);},
  reveal:function(){tone(1200,.2,'sine',.06,undefined,2000);},
  trap:function(){tone(900,.15,'square',.06,undefined,200);},
  deny:function(){tone(180,.15,'square',.08,undefined,120);},
  click:function(){tone(700,.04,'square',.03);},
  hover:function(){tone(1100,.02,'sine',.015);},
  leak:function(){tone(110,.5,'sawtooth',.12,undefined,60);noise(.3,.08,150,1);},
  bossWarn:function(){tone(160,.5,'sawtooth',.12);tone(150,.6,'sawtooth',.12,ctx.currentTime+.55);tone(140,.8,'sawtooth',.12,ctx.currentTime+1.1);},
  bossRoar:function(){tone(70,1.1,'sawtooth',.16,undefined,45);noise(1,.12,120,.6);},
  waveStart:function(){tone(330,.12,'triangle',.08);tone(495,.18,'triangle',.07,ctx.currentTime+.1);},
  win:function(){[523,659,784,1046].forEach(function(f,i){tone(f,.3,'triangle',.09,ctx.currentTime+i*.14);});},
  lose:function(){[400,330,260,180].forEach(function(f,i){tone(f,.35,'sawtooth',.08,ctx.currentTime+i*.18);});},
  blackhole:function(){tone(300,.6,'sine',.14,undefined,50);noise(.5,.1,300,.5);},
  lock:function(){noise(.4,.12,500,1);tone(120,.4,'square',.08,undefined,60);},
  downgrade:function(){tone(700,.2,'sine',.06,undefined,400);}
};

/* ---------- 环境声（滤波噪声 + 低频脉动） ---------- */
function startAmbient(theme){
  if(!ctx)return;
  stopAmbient();
  mapTheme=theme;
  var bp=ctx.createBiquadFilter();bp.type='lowpass';bp.frequency.value= theme===0?500:(theme===1?760:340);
  var src=ctx.createBufferSource();
  var len=ctx.sampleRate*3,buf=ctx.createBuffer(1,len,ctx.sampleRate),d=buf.getChannelData(0);
  for(var i=0;i<len;i++)d[i]=Math.random()*2-1;
  src.buffer=buf;src.loop=true;
  var g=ctx.createGain();g.gain.value=.05;
  src.connect(bp);bp.connect(g);g.connect(ambGain);src.start(0);
  ambNodes.push(src);
  // 低频脉动
  var lfo=ctx.createOscillator(),lfog=ctx.createGain();lfo.frequency.value=.07+theme*.02;lfog.gain.value=.015;
  var drone=ctx.createOscillator(),dg=ctx.createGain();drone.type='sine';drone.frequency.value= theme===2?48:64;dg.gain.value=.05;
  lfo.connect(lfog);lfog.connect(dg.gain);drone.connect(dg);dg.connect(ambGain);lfo.start();drone.start();
  ambNodes.push(lfo,drone);
  // 偶发数据脉冲
  ambNodes._pulse=setInterval(function(){
    if(!ctx||muted)return;
    var t=ctx.currentTime;
    tone(1400+Math.random()*1200,.05,'sine',.012,t);
  },2200);
}
function stopAmbient(){
  ambNodes.forEach(function(n){try{n.stop();}catch(e){}});
  if(ambNodes._pulse)clearInterval(ambNodes._pulse);
  ambNodes=[];
}

/* ---------- 音乐：小调五声循环的简易序列器 ---------- */
var THEMES=[
  {root:220,scale:[0,3,5,7,10],bpm:92},
  {root:196,scale:[0,2,3,7,8],bpm:104},
  {root:165,scale:[0,3,5,6,10],bpm:80}
];
var step=0;
function startMusic(theme){
  if(!ctx)return;
  stopMusic();
  var th=THEMES[theme]||THEMES[0];step=0;
  var beat=60/th.bpm/2;
  musicTimer=setInterval(function(){
    if(muted)return;
    var t=ctx.currentTime;
    var s=th.scale[(step*7+((step*3)%5))%th.scale.length];
    var f=th.root*Math.pow(2,Math.floor(s/12))*(s%12===0?1:Math.pow(2,(s%12)/12));
    if(step%8===0)tone(f/2,beat*3.4,'triangle',.05,t);
    if(step%2===0)tone(f*2,beat*.9,'sine',.025,t);
    if(step%4===2)tone(f*3,beat*.5,'sine',.012,t);
    if(step%8===6)noise(.08,.02,600,3);
    step++;
  },beat*1000);
}
function stopMusic(){if(musicTimer){clearInterval(musicTimer);musicTimer=null;}}

return {
  init:function(){ensure();},
  sfx:function(name){if(ensure()&&!muted&&SFX[name]){resume();SFX[name]();}},
  enterMap:function(theme){try{if(ensure()){resume();startAmbient(theme);startMusic(theme);}}catch(e){console.warn('audio enterMap fail',e);}},
  suspend:function(){stopAmbient();stopMusic();},
  setMuted:function(m){muted=m;if(master)master.gain.value=m?0:vol;},
  isMuted:function(){return muted;},
  setVolume:function(v){vol=v;if(master&&!muted)master.gain.value=v;}
};
})();
