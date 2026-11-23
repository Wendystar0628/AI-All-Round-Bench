// Short synthesized sounds keep the local-file build self contained.
let masterAudio=null;
function audioOutput(){
  if(!masterAudio){masterAudio=audio.createGain();masterAudio.connect(audio.destination);syncAudioOutput()}
  return masterAudio;
}
function syncAudioOutput(){if(masterAudio)masterAudio.gain.setValueAtTime(muted?0:volume,audio.currentTime)}
function audioTone(frequency, duration, shape, strength, endFrequency, delay=0) {
  if (!audio || muted || volume <= 0) return;
  const now=audio.currentTime+delay, osc=audio.createOscillator(), gain=audio.createGain();
  osc.type=shape;osc.frequency.setValueAtTime(Math.max(35,frequency),now);
  if(endFrequency)osc.frequency.exponentialRampToValueAtTime(Math.max(35,endFrequency),now+duration);
  gain.gain.setValueAtTime(.0001,now);gain.gain.linearRampToValueAtTime(Math.max(.0002,strength),now+.012);
  gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
  osc.connect(gain);gain.connect(audioOutput());osc.start(now);osc.stop(now+duration+.01);
}
function sfx(kind){
  if(!audio||muted||exporting)return;
  switch(kind){
    case 'ui': audioTone(780,.09,'sine',.035,550);break;
    case 'deploy': audioTone(340,.15,'triangle',.06,560);audioTone(680,.12,'sine',.025,800,.05);break;
    case 'inter': audioTone(1150,.09,'square',.025,490);break;
    case 'fire': audioTone(210,.13,'square',.032,85);break;
    case 'sandbox': audioTone(460,.21,'sine',.04,220);audioTone(730,.18,'triangle',.02,370,.035);break;
    case 'heal': audioTone(520,.2,'sine',.025,690);audioTone(780,.15,'sine',.018,930,.04);break;
    case 'attack': audioTone(145,.13,'sawtooth',.025,65);break;
    case 'ransom': audioTone(360,.23,'sawtooth',.025,130);break;
    case 'shield': audioTone(640,.19,'sine',.025,870);break;
    case 'kill': audioTone(300,.13,'triangle',.035,110);break;
    case 'destroy': audioTone(110,.3,'sawtooth',.045,45);audioTone(220,.18,'square',.02,80);break;
    case 'upgrade': audioTone(430,.18,'triangle',.04,640);audioTone(650,.2,'sine',.035,950,.07);break;
    case 'skill': audioTone(410,.27,'sine',.05,900);audioTone(620,.25,'triangle',.025,1200,.06);break;
    case 'isolate': audioTone(520,.14,'square',.028,260);audioTone(230,.18,'sine',.04,150,.09);break;
    case 'slow': audioTone(720,.32,'sine',.04,180);break;
    case 'restore': audioTone(330,.23,'sine',.04,740);audioTone(660,.18,'sine',.025,990,.09);break;
    case 'wave': audioTone(190,.25,'triangle',.04,260);audioTone(300,.24,'triangle',.03,410,.12);break;
    case 'boss': audioTone(85,.65,'sawtooth',.04,55);audioTone(165,.45,'triangle',.04,90,.12);break;
    case 'warning': audioTone(500,.15,'square',.025,450);audioTone(500,.15,'square',.025,450,.2);break;
    case 'leak': audioTone(300,.3,'sawtooth',.035,75);break;
    case 'victory': audioTone(330,.25,'sine',.04,440);audioTone(440,.28,'sine',.04,660,.18);audioTone(660,.45,'sine',.04,880,.38);break;
  }
}

// Filtered, self-generated noise gives each network a quiet environmental bed.
let ambientNoiseBuffer=null;
function ambientNoise(duration,frequency,strength,filterType='lowpass'){
  if(!audio||muted||exporting||volume<=0)return;
  if(!ambientNoiseBuffer){
    ambientNoiseBuffer=audio.createBuffer(1,audio.sampleRate,audio.sampleRate);
    let data=ambientNoiseBuffer.getChannelData(0),seed=43981;
    for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;data[i]=seed/2147483648-1}
  }
  const now=audio.currentTime,source=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();
  source.buffer=ambientNoiseBuffer;source.loop=true;filter.type=filterType;filter.frequency.value=frequency;
  gain.gain.setValueAtTime(.0001,now);gain.gain.linearRampToValueAtTime(Math.max(.0002,strength),now+.2);
  gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
  source.connect(filter);filter.connect(gain);gain.connect(audioOutput());source.start(now);source.stop(now+duration+.01);
}

function ambientMusic(index,time){
  if(!audio||muted||exporting)return;
  const scales=[[110,138.59,164.81,207.65],[98,146.83,123.47,196],[82.41,110,123.47,164.81]];
  const scale=scales[index],step=Math.floor(time/1.4),note=scale[step%scale.length];
  audioTone(scale[0]/2,1.35,'sine',.015,scale[0]/2);
  audioTone(note,.9,'sine',.018,note*1.002);
  if(index===0){ambientNoise(1.25,320,.012);audioTone(note*2,.55,'sine',.009,note*2,.35);if(step%4===0)audioTone(1180,.06,'square',.006,920,.7)}
  if(index===1){ambientNoise(1.2,1900,.008,'bandpass');audioTone(note*1.5,.42,'triangle',.009,note*1.51,.55);audioTone(note*3,.4,'sine',.006,note*3.15,.9)}
  if(index===2){ambientNoise(1.25,580,.011,'bandpass');audioTone(note*.5,.3,'triangle',.015,note*.48,.8);if(step%2===0)audioTone(145,.12,'square',.012,90,.5)}
}
