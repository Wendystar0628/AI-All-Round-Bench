const SR=24000, duration=149;
function tapePosition(t){
 const first=Math.min(t,1),last=Math.max(0,t-5.5);
 return .76*t+.24*first-.12*first*first+.24*last*last;
}
function tapeLoop(t){return t>=2&&t<4?2+(t-2)%.5:t}

function createComposer(){
const pi=Math.PI,TAU=2*pi;
const parts=[
['brass','bass','jazz'],['choir','bells','rail'],['horn','flute','march'],['keys','synth','pop'],['piano','strings','soft'],['whistle','uke','toy'],['synth','bells','dance'],['brass','bass','march'],['guitar','piano','rock'],['reed','piano','waltz'],['metal','sub','machine'],['wood','bells','type'],['flute','qin','ink'],['shaku','shami','taiko'],['wood','harp','toy'],['harp','piano','soft'],['organ','guitar','surf'],['keys','sub','hip'],['square','triangle','chip'],['synth','sub','rain'],['sax','keys','tape'],['bit','square','glitch']];
const score=[],motif=[0,3,7,10,7,5,3,2,0,5,7,3],at=[0,.5,1.5,2,3,4,5,6.5,7,8.5,10,11],roots=[57,55,62,62,60,65,62,60,62,57,50,62,62,57,60,65,60,55,62,50,57,57];
function note(start,key,len,voice,amp=.17,pan=0,mode=''){score.push({start,key,len,voice,amp,pan,mode,f:440*2**((key-69)/12)})}
function drum(t,v,a=.15){note(t,v==='bell'?88:36,v==='bell'?.92:v==='kick'?.21:v==='snare'?.15:.085,v,a)}
[0,1,2,3,4,5].forEach((k)=>note(k*.5,62+motif[k],.96,'piano',.2));
note(3,62,.9,'piano',.29);
note(4,69,.47,'piano',.17);
note(4.5,72,.54,'piano',.16);
for(let i=0;i<22;i++){let b=5+i*6,[lead,comp,style]=parts[i],root=roots[i];let quiet=['ink','soft','taiko'].includes(style);if(style==='tape')continue;
if(style==='chip'){
 for(let j=0;j<12;j++){
  const beat=b+j*.5,melodyTime=b+at[j]*.5;
  note(melodyTime,root+12+motif[j],Math.min(.39,((at[j+1]||12)-at[j])*.48),'square',.13,-.22);
  note(beat,root-12+[0,7,0,5][j%4],.38,'triangle',.22);
  if(j!==6)note(beat+.12,root+[0,3,7,10][j%4],.17,'pulse',.10,.3);
  note(beat,36,j%2?.055:.11,'chipNoise',j%2?.085:.13);
 }
 note(b+3,86,.115,'pulse',.15,.3);
 note(b+3.12,94,.28,'pulse',.14,.3);
 continue;
}
for(let j=0;j<12;j++){
let noteKey=root+motif[j]+(lead==='sub'?0:12),st=b+at[j]*.5,l=(at[j+1]||12.5)*.5-at[j]*.5;
note(st,noteKey,Math.min(1.35,l+.22),lead,quiet?.14:.135,-.14);
if(i===21&&j%2)note(st+.19,noteKey+12,.095,'bit',.12,.32);
if(j%2===0||style==='jazz'||style==='chip')note(b+j*.5,root-12+[0,0,7,5][Math.floor(j/3)],quiet?.61:.32,'bass',.19,-.07);
if(!quiet||j%3===0)drum(b+j*.5,'chain',quiet?.027:.045);
if(j%2===0||['dance','machine','surf'].includes(style))drum(b+j*.5,'kick',quiet?.075:.21);
if(!quiet&&j%4===2)drum(b+j*.5,'snare',.15);
if(!quiet&&j%2===1)drum(b+j*.5+.25,style==='type'||style==='rail'?'chain':'hat',.06);
if(j%4===0)drum(b+j*.5,'bell',quiet?.045:.064);
if(style==='jazz'&&j%4===3){drum(b+j*.5+.18,'snare',.1);note(b+j*.5+.25,root+15,.16,'brass',.1)}
}
for(let k=0;k<3;k++){let base=root+[0,-5,-2][k];for(let j=0;j<3;j++){let off=['soft','ink','type','toy'].includes(style)?j*.25:style==='waltz'?j*.47:j*.07;note(b+k*2+off,base+[0,3,7][j],['strings','bells','keys','harp','piano'].includes(comp)?1.55:.75,comp,.068,.38)}
if(['rail','march','soft','rock'].includes(style))note(b+k*2,base+7,2,'strings',.065,-.43);
if(style==='machine'||style==='type')for(let j=0;j<4;j++)note(b+k*2+.22+j*.45,45+j*4,.11,'metal',.11,.5);
if(style==='rain'||style==='waltz'||style==='tape')note(b+k*2,40,2.01,'hiss',style==='rain'?.034:.014,.3);
}if(i===3||i===16)drum(b+2,'bell',.21);if(i===8)drum(b+4,'bell',.24);}
for(let j=0;j<20;j++){let t=137+j*.5;for(let k=0;k<parts.length;k++){let key=57+motif[j%12]+(k%4===0?-12:k%3===0?12:0);note(t,key,.54+((k%3)*.1),parts[k][0],.017,(k%7-3)*.23)}if(j%2===0)drum(t,'kick',.18);drum(t,'chain',.07)}
for(let j=0;j<22;j++){
 const key=78+(j%5)*3,pan=(j%9-4)*.22;
 note(147+j*.004,key,1.5,'bells',.035,pan);
 note(148.5+j*.0006,key,.485-j*.0006,'bells',.041,pan);
}
for(let j=0;j<3;j++){
 const hit=65+[2,2.75,3.5][j];
 note(hit-.16,41,.17,'hiss',.1,-.28+j*.27);
 note(hit,58+j*5,.15,'metal',.13,-.28+j*.27);
}
for(let j=0;j<4;j++)note(25+j*.16,79+[0,4,7,4][j],.68,'bells',.1,.32);
for(const e of score)if(e.start>=137&&e.start<147)e.len=Math.min(e.len,147-e.start);
for(let j=0;j<8;j++)note(35.25+j*.5,81+[0,7,3,10,7,5,2,0][j],.27,'toyPiano',.086,.36);
for(let beat=0;beat<9;beat++)note(41+beat*.5,81+[0,4,7,9][beat%4],.115,'bells',.082,(beat%3-1)*.25);
note(45.5,49,.17,'bit',.13,.16);
note(32.5,88,.095,'keys',.067,.36);
note(32.59,93,.15,'bells',.045,.38);
for(let j=0;j<9;j++){
 const pass=54.82+j*.218,pan=.84-j*.205,envelope=Math.sin(Math.PI*(j+.5)/9);
 note(pass,36,.31,'railAir',.048*envelope,pan);
 note(pass+.038,43-j*.35,.23,'fret',.056*envelope,pan);
}
for(let j=0;j<6;j++)note(90.8+j*.083,[79,83,86,90,93,95][j],.75,'harp',.063,-.55+j*.2);
for(let j=0;j<3;j++)note(92.28+j*.185,89+[0,7,4][j],1.02,'bells',.044,.36-j*.32);
for(let beat=0;beat<12;beat++){
 const onward=11+beat*.5;
 note(onward+.13,37,.10,'railClack',.055,beat%2?-.14:.14);
 note(onward+.22,43,.075,'railClack',.036,beat%2?.25:-.25);
}
for(let j=0;j<4;j++)note(13+j*.25,55+[0,3,7,10][j],1.55,'choir',.047,j%2?.42:-.34);
for(let j=0;j<5;j++)note(18.875+j*.125,74+[0,2,5,7,9][j],.27,'flute',.088,-.25+j*.1);
for(let j=0;j<3;j++)note(19.5,50+[0,7,12][j],1.24,'horn',.049,.32-j*.19);
score.sort((a,b)=>a.start-b.start);
const sin=Math.sin;
function renderVoices(k,voices){let left=new Float32Array(SR),right=new Float32Array(SR);
for(const e of voices){if(e.start>=k+1)break;if(e.start+e.len<=k)continue;let from=Math.max(0,Math.ceil((e.start-k)*SR)),to=Math.min(SR,Math.ceil((e.start+e.len-k)*SR)),v=e.voice,slow=['choir','strings','sax','reed','shaku','horn'].includes(v),atk=slow?.064:.007;let panL=e.amp*Math.sqrt((1-e.pan)*.5),panR=e.amp*Math.sqrt((1+e.pan)*.5);
for(let n=from;n<to;n++){let t=k-e.start+n/SR,q=t/e.len,env=Math.min(1,t/atk)*Math.min(1,(e.len-t)/Math.min(.13,e.len*.32)),a=TAU*e.f*t,w=0;let hash=Math.imul((n+SR*k)^15331,1597334677);let noise=((hash^(hash>>>12))&65535)/32768-1;
if(v==='fret')a=TAU*e.f*(t-.012*(1-Math.exp(-21*t)))+.045*sin(t*24);
switch(v){case 'kick':w=sin(305*t+19*(1-Math.exp(-36*t)))*Math.exp(-16*t);break;case 'snare':w=(noise*.65+sin(1090*t)*.35)*Math.exp(-19*t);break;case 'hat':case 'chain':w=(noise*.64+sin(t*(v==='hat'?46800:28312))*.36)*Math.exp(-50*t);break;case 'hiss':w=noise;break;case 'railClack':w=(.52*noise+.48*sin(565*t+3*sin(1050*t)))*Math.exp(-33*t);break;case 'railAir':w=.77*noise+.23*sin(714*t+13*sin(22*t));break;case 'bell':case 'bells':w=(sin(a)+.45*sin(a*2.73)+.22*sin(a*4.17))*Math.exp(-3.7*t);break;case 'piano':case 'keys':w=(sin(a+.7*sin(a*2)*Math.exp(-4*t))+.23*sin(a*2.003)+.12*sin(a*3.01))*Math.exp(-(v==='keys'?1.7:2.6)*t);break;case 'wood':case 'metal':w=(sin(a)+sin(a*(v==='wood'?3.93:2.37))*.49)*Math.exp(-8*t);break;case 'triangle':w=2*Math.asin(sin(a))/pi;break;case 'square':w=sin(a)>.12?.64:-.64;break;case 'bit':w=Math.round(sin(Math.floor(t*4000)/4000*TAU*e.f)*4)/4*(Math.floor(t*19)%4===3?.15:1);break;case 'bass':case 'sub':case 'fret':w=(sin(a+(v==='fret'?.06*sin(t*23):0))+.24*sin(a*2))*Math.exp(-2.2*t);break;case 'pulse':w=sin(a)>.65?.65:-.38;break;
case 'chipNoise':w=noise*Math.exp(-31*t);break;
case 'organ':w=.77*sin(a)+.27*sin(a*2)+.24*sin(a*3)+.16*sin(a*4)+.07*sin(a*6);break;
case 'synth':w=.64*sin(a+.65*sin(2*a))+.38*sin(a*1.004+.95*sin(a*1.004));break;
case 'horn':w=.82*sin(a)+.24*sin(2*a)+.22*sin(3*a)+.10*sin(4*a);break;
case 'reed':w=.63*sin(a)+.28*sin(a*1.008)+.29*sin(a*2.012)+.22*sin(a*3);break;
case 'sax':w=.66*sin(a+.32*sin(a+.06*sin(t*28)))+.4*sin(a*2)+.22*sin(a*3)+.1*sin(a*4);break;
case 'brass':w=sin(a+(.73+.1*sin(t*32))*sin(a))+.3*sin(2*a+.03*sin(t*31))+.13*sin(3*a);break;case 'choir':w=.57*sin(a+.06*sin(t*28))+.24*sin(2*a)+.26*sin(3.003*a)+.14*sin(4.007*a)+.10*sin(5*a);break;case 'strings':w=.51*sin(a*.998)+.49*sin(a*1.004+.08*sin(t*26))+.21*sin(a*2);break;case 'shami':w=(.75*sin(a+.11*sin(2*a))+.40*sin(2*a)+.32*sin(4*a)+.18*noise*Math.exp(-26*t))*Math.exp(-6*t);break;case 'qin':w=(sin(a+.04*sin(t*14))+.30*sin(2*a)+.14*sin(a*4.003))*Math.exp(-2.8*t);break;case 'toyPiano':w=(sin(a)+.42*sin(2.81*a)+.16*sin(5.17*a))*Math.exp(-8.6*t);break;
case 'uke':w=(sin(a)+.43*sin(a*2.004)+.26*sin(a*3)+.1*noise*Math.exp(-48*t))*Math.exp(-5.4*t);break;
case 'guitar':case 'harp':w=(sin(a)+.49*sin(2*a)+.26*sin(3.006*a)+.15*sin(4.003*a))*Math.exp(-(v==='shami'?6:3.7)*t);break;case 'flute':case 'whistle':case 'shaku':w=sin(a+.09*sin(t*32))+.11*sin(2*a)+.05*noise;break;default:w=sin(a)+.32*sin(a*2)+.2*sin(a*3)}
left[n]+=w*env*panL;right[n]+=w*env*panR}}
return [left,right];
}
// Integrate the capstan speed so both pitch and duration change together.
let tapeSession;
function mallTape(){
 if(tapeSession)return tapeSession;
 const voices=[];
 function record(t,key,len,voice,amp,pan){
  voices.push({start:tapePosition(t),key,len:len*.79,voice,amp,pan,f:440*2**((key-69)/12)});
 }
 for(let j=0;j<12;j++){
  const t=at[j]/2,duration=((at[j+1]||12)-at[j])/2;
  record(t,69+motif[j],duration+.095,'sax',.126,-.20);
  record(j/2,45+[0,7,10,7,5,12,9,7,2,9,7,4][j],.47,'fret',.192,-.06);
  record(j/2,36,j%2?.061:.19,j%2?'chain':'kick',j%2?.053:.14,.12);
  if(j%4===2)record(j/2,36,.13,'snare',.10,.25);
  if(j%4===0)record(j/2,84,.57,'bells',.047,.41);
 }
 const chords=[[57,60,64,67,71],[53,57,60,64,67],[55,59,62,65,69]];
 for(let j=0;j<3;j++)for(let k=0;k<5;k++){
  record(j*2+.012*k,chords[j][k],1.48,'keys',.062,.34);
  record(j*2+1.36+.01*k,chords[j][k]+(k===4?2:0),.48,'keys',.042,.12);
 }
 voices.sort((a,b)=>a.start-b.start);
 const original=[new Float32Array(SR*6),new Float32Array(SR*6)];
 for(let k=0;k<6;k++){const raw=renderVoices(k,voices);for(let c=0;c<2;c++)original[c].set(raw[c],k*SR)}
 // Stereo reflections are printed onto the source tape before the speed change.
 for(let n=0;n<SR*6;n++){
  if(n>3953)original[0][n]+=.24*original[1][n-3953];
  if(n>5381)original[1][n]+=.22*original[0][n-5381];
 }
 const output=[new Float32Array(SR*6),new Float32Array(SR*6)],low=[0,0];
 for(let n=0;n<SR*6;n++){
  const t=n/SR,head=tapeLoop(t),flutter=.00093*sin(head*11.7)+.00021*sin(head*39);
  const atSample=Math.max(0,(tapePosition(head)+flutter)*SR),base=Math.floor(atSample),frac=atSample-base;
  const hash=Math.imul(n^12347,1597334677),hiss=(((hash^(hash>>>13))&65535)/32768-1)*.0043;
  const edge=Math.min(1,n/100,(SR*6-n)/650);
  for(let c=0;c<2;c++){
   const signal=original[c][base]*(1-frac)+original[c][base+1]*frac;
   low[c]+=.28*(signal-low[c]);output[c][n]=(low[c]+hiss)*edge;
  }
 }
 tapeSession=output;return output;
}
function renderSecond(k){
 const [left,right]=renderVoices(k,score);
 if(k>=125&&k<131){const tape=mallTape(),offset=(k-125)*SR;for(let n=0;n<SR;n++){left[n]+=tape[0][offset+n];right[n]+=tape[1][offset+n]}}
for(let n=0;n<SR;n++){left[n]=Math.tanh(left[n]*1.18);right[n]=Math.tanh(right[n]*1.18)}return [left,right]}
return renderSecond;
}

const chunks=new Map(),pendingAudio=new Map();
let scoreWorker=null,workerURL=null,fallbackComposer=null;
function renderOnMain(k){
 if(!chunks.has(k)){
  fallbackComposer??=createComposer();
  chunks.set(k,fallbackComposer(k));
 }
 return chunks.get(k);
}
function composeInWorker(){
 const render=createComposer();
 const todo=new Set(Array.from({length:duration},(_,n)=>n));
 let priority=0;
 self.onmessage=e=>{priority=e.data};
 function next(){
  const k=todo.has(priority)?priority:todo.values().next().value;
  if(k===undefined){self.close();return}
  todo.delete(k);priority=k+1;
  const channels=render(k);
  self.postMessage({k,channels},channels.map(samples=>samples.buffer));
  setTimeout(next,0);
 }
 next();
}
function revokeWorkerURL(){
 if(workerURL){URL.revokeObjectURL(workerURL);workerURL=null}
}
function prepareAudio(){
 try{
  // Inline the pure composer into a Blob so file:// playback needs no local fetch.
  const script=['const SR='+SR+',duration='+duration+';',tapePosition.toString(),tapeLoop.toString(),createComposer.toString(),'('+composeInWorker.toString()+')();'].join('\n');
  workerURL=URL.createObjectURL(new Blob([script],{type:'text/javascript'}));
  scoreWorker=new Worker(workerURL);
  scoreWorker.onmessage=({data:{k,channels}})=>{
   revokeWorkerURL();chunks.set(k,channels);
   const task=pendingAudio.get(k);
   if(task){pendingAudio.delete(k);task.resolve(channels)}
   if(chunks.size===duration)scoreWorker=null;
  };
  scoreWorker.onerror=e=>{
   e.preventDefault();scoreWorker?.terminate();scoreWorker=null;revokeWorkerURL();
   for(const [k,task] of pendingAudio)task.resolve(renderOnMain(k));
   pendingAudio.clear();
  };
 }catch{scoreWorker=null;revokeWorkerURL()}
}
function audioChunk(k){
 if(chunks.has(k))return Promise.resolve(chunks.get(k));
 if(!scoreWorker)return Promise.resolve(renderOnMain(k));
 if(!pendingAudio.has(k)){
  let resolve;
  const promise=new Promise(done=>{resolve=done});
  pendingAudio.set(k,{promise,resolve});scoreWorker.postMessage(k);
 }
 return pendingAudio.get(k).promise;
}
let ac=null,sources=[],audioNext=0,audioOrigin=0,audioWaiting=null,audioGeneration=0;
function hush(){
 audioGeneration++;audioWaiting=null;
 for(const source of sources)try{source.stop()}catch{}
 sources=[];
}
function audioStart(t){
 hush();
 if(muted||t>=duration)return;
 if(!ac)ac=new AudioContext();
 const generation=audioGeneration,first=Math.floor(t);
 function ready(){
  if(generation!==audioGeneration)return;
  audioWaiting=null;audioOrigin=ac.currentTime-t;audioNext=first;audioPump(t);
 }
 if(ac.state==='running'&&chunks.has(first)){ready();return}
 audioWaiting=t;
 Promise.all([ac.resume(),audioChunk(first)]).then(ready,()=>{
  if(generation===audioGeneration){audioWaiting=null;origin=performance.now()/1000-t}
 });
}
function audioPump(t){
 if(!ac||muted||audioWaiting!==null)return;
 while(audioNext<duration&&audioNext<=t+.5){
  const k=audioNext;
  if(!chunks.has(k)){audioChunk(k);break}
  audioNext++;
  const offset=Math.max(0,ac.currentTime-audioOrigin-k);
  if(offset>=1)continue;
  const channels=chunks.get(k),buffer=ac.createBuffer(2,SR,SR);
  buffer.copyToChannel(channels[0],0);buffer.copyToChannel(channels[1],1);
  const source=ac.createBufferSource();source.buffer=buffer;source.connect(ac.destination);
  source.start(Math.max(ac.currentTime,audioOrigin+k),offset);sources.push(source);
  source.onended=()=>{sources=sources.filter(item=>item!==source)};
 }
}
prepareAudio();
async function wav(){let samples=149*SR,buf=new ArrayBuffer(44+samples*4),d=new DataView(buf),w=(p,s)=>[...s].forEach((c,i)=>d.setUint8(p+i,c.charCodeAt(0)));w(0,'RIFF');d.setUint32(4,buf.byteLength-8,true);w(8,'WAVE');w(12,'fmt ');d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,2,true);d.setUint32(24,SR,true);d.setUint32(28,SR*4,true);d.setUint16(32,4,true);d.setUint16(34,16,true);w(36,'data');d.setUint32(40,samples*4,true);for(let k=0;k<149;k++){let arr=await audioChunk(k);for(let j=0;j<SR;j++){let p=44+(k*SR+j)*4;d.setInt16(p,Math.round(arr[0][j]*32767),true);d.setInt16(p+2,Math.round(arr[1][j]*32767),true)}if(k%8===0)await new Promise(r=>setTimeout(r,0))}return new Blob([buf],{type:'audio/wav'})}

