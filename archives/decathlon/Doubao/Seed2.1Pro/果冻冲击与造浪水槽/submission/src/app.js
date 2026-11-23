'use strict';
/* 主控制器：渲染器、场景切换、UI、实时循环、导演与导出接口。 */

const $=id=>document.getElementById(id);

class App {
  constructor(){
    this.renderer=new THREE.WebGLRenderer({canvas:$('webgl'),antialias:true,
      powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.setSize(innerWidth,innerHeight);
    this.renderer.shadowMap.enabled=true;
    this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.outputEncoding=THREE.sRGBEncoding;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.05;

    this.current='jelly';
    this.paused=false;
    this.slow=false;
    this.exporting=false;
    this.lastT=performance.now();
    this.director=new Director(this);

    this._initJelly();
    this._bindUI();
  }

  async boot(){
    $('loadingText').textContent='正在启动 Jelly 软体…';
    await new Promise(r=>setTimeout(r,30));
    $('loadingText').textContent='正在编译 WebGPU 水体（MPM）…';
    this.tankSim=new TankSim();
    try{
      await this.tankSim.init();
      this.tank=new TankScene(this.renderer,this.tankSim);
    }catch(err){
      $('loadingText').textContent='WebGPU 初始化失败：'+err.message;
      console.error(err);
      return;
    }
    this.toJelly();
    $('loading').classList.add('hidden');
    requestAnimationFrame(t=>this._loop(t));
    this._installExport();
  }

  _initJelly(){
    this.jelly=new JellyScene(this.renderer);
  }

  toJelly(){
    if(this.current==='jelly'&&this.jelly) return;
    this.current='jelly';
    document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.scene==='jelly'));
    $('paramJelly').style.display=''; $('paramTank').style.display='none';
    this.jelly.controls.enabled=true;
    if(this.tank) this.tank.controls.enabled=false;
  }
  toTank(){
    if(this.current==='tank') return;
    this.current='tank';
    document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.scene==='tank'));
    $('paramJelly').style.display='none'; $('paramTank').style.display='';
    this.jelly.controls.enabled=false;
    this.tank.controls.enabled=true;
  }

  /* —— 供导演调用的统一仿真步 —— */
  async simStep(dt){
    if(this.current==='jelly'){
      this.jelly.advance(dt);
    }else{
      await this.tankSim.advance(dt,true);
      this.tank.sync(dt);
      this._handleTankEvents();
    }
  }

  _handleTankEvents(){
    for(const e of this.tankSim.events){
      if(e.type==='splash') Sound.splash(e.intensity,e.pos);
      if(e.type==='clink') Sound.clink(e.intensity,e.pos,'metal');
    }
    this.tankSim.events.length=0;
  }

  applyCam(s){
    const sc=this.current==='jelly'?this.jelly:this.tank;
    sc.camera.position.copy(s.pos);
    sc.controls.target.copy(s.tgt);
    sc.camera.fov=s.fov; sc.camera.updateProjectionMatrix();
    sc.controls.update();
  }

  clearBalls(){
    if(!this.jelly) return;
    [this.jelly.ballS,this.jelly.ballM,this.jelly.ballL,this.jelly.ballStone].forEach(b=>{
      if(b){b.active=false;b.mesh.visible=false;b.pos.set(99,99,99);b.vel.set(0,0,0);}
    });
  }
  clearTankBalls(){ this.tankSim.balls.forEach(b=>b.active=false); }

  dropDemoBalls(list){
    // list: [x,y,z]，组按顺序循环 5 组
    const groups=[];
    list.forEach((p,i)=>{
      const g=i%5;
      this.tankSim.spawnBalls([{group:g,x:p[0],y:p[1],z:p[2],r:0.075,
        density:this.tank.ballDensity[g]*1000,
        vx:0,vy:0,vz:0}]);
    });
  }

  /* ================= UI ================= */
  _bindUI(){
    document.querySelectorAll('.tab').forEach(tab=>{
      tab.addEventListener('click',()=>{
        if(this.exporting) return;
        if(tab.dataset.scene==='jelly') this.toJelly(); else this.toTank();
      });
    });
    // 滑块
    const bind=(id,vid,fmt,cb)=>{
      const el=$(id), out=$(vid);
      const upd=()=>{ out.textContent=fmt(parseFloat(el.value)); cb(parseFloat(el.value)); };
      el.addEventListener('input',upd); upd();
    };
    bind('jSoft','jSoftV',v=>v.toFixed(2),v=>{this.jelly.softness=v;this.jelly.setParams({softness:v});});
    bind('jTough','jToughV',v=>v.toFixed(2),v=>{this.jelly.toughness=v;this.jelly.setParams({toughness:v});});
    bind('bMass','bMassV',v=>v.toFixed(1)+' kg',v=>this.jelly.setParams({ballMass:v}));
    bind('bHeight','bHeightV',v=>v.toFixed(1)+' m',v=>this.jelly.setParams({dropHeight:v}));
    bind('wAmp','wAmpV',v=>v.toFixed(2),v=>{this.tankSim&&this.tankSim.setWave(this.tankSim.waveOn,v);});
    bind('wFreq','wFreqV',v=>v.toFixed(2)+' Hz',v=>{this.tankSim&&this.tankSim.setWave(this.tankSim.waveOn,undefined,v);});

    $('trigCenter').addEventListener('click',()=>this.jelly.trigger('center'));
    $('trigOffset').addEventListener('click',()=>this.jelly.trigger('offset'));
    $('trigCont').addEventListener('click',()=>this.jelly.trigger('continuous'));
    $('btnWave').addEventListener('click',()=>{
      const on=!this.tankSim.waveOn;
      this.tankSim.setWave(on);
      $('btnWave').textContent=on?'停止造浪':'开始造浪';
      if(on) Sound.waveStart(); else Sound.waveStop();
    });
    $('btnDrop').addEventListener('click',()=>{
      const list=[];
      for(let g=0;g<5;g++) list.push([0.8+Math.random()*2.4,1.6+Math.random()*0.5,0.3+Math.random()*0.65]);
      this.dropDemoBalls(list);
    });
    $('btnPause').addEventListener('click',e=>{
      this.paused=!this.paused; e.target.classList.toggle('on',this.paused);
      e.target.textContent=this.paused?'继续':'暂停';
    });
    $('btnSlow').addEventListener('click',e=>{
      this.slow=!this.slow; e.target.classList.toggle('on',this.slow);
      e.target.textContent=this.slow?'常速 ×1':'慢放 ×0.25';
    });
    $('btnReset').addEventListener('click',()=>this._resetCurrent());
    $('btnRerun').addEventListener('click',()=>this._resetCurrent());
    $('btnSound').addEventListener('click',e=>{
      const on=!Sound.enabled; Sound.setEnabled(on);
      e.target.classList.toggle('on',on); e.target.textContent=on?'声音 开':'声音 关';
      if(!on) Sound.waveStop();
    });
    document.addEventListener('pointerdown',()=>Sound.resume(),{once:true});
    document.querySelectorAll('.demo').forEach(btn=>{
      btn.addEventListener('click',()=>this._playDemo(btn.dataset.run));
    });

    // 密度行
    const rows=$('densityRows');
    BALL_NAMES.forEach((name,g)=>{
      const row=document.createElement('div'); row.className='drow';
      const color='#'+BALL_COLORS[g].toString(16).padStart(6,'0');
      row.innerHTML=`<span class="swatch" style="background:${color};color:${color}"></span>
        <input type="range" min="0.25" max="2.2" step="0.01" value="${BALL_DENS[g]}">
        <span>${BALL_DENS[g].toFixed(2)}</span>`;
      const input=row.querySelector('input'), out=row.querySelector('span');
      input.addEventListener('input',()=>{
        const v=parseFloat(input.value); out.textContent=v.toFixed(2);
        this.tank&&this.tankSim.setDensityGroup(g,v);
        if(this.tank) this.tank.ballDensity[g]=v;
      });
      rows.appendChild(row);
    });

    addEventListener('resize',()=>this._resize());
  }

  _resetCurrent(){
    if(this.current==='jelly'){ this.jelly.reset(); }
    else{ this.tankSim.resetWater(); $('btnWave').textContent='开始造浪'; }
  }

  async _playDemo(runId){
    document.querySelectorAll('.demo').forEach(b=>b.classList.toggle('active',b.dataset.run===runId));
    const badge=$('demoBadge');
    const titles={'jelly-center':['正中单击','重球正中落下，包住、压扁、回弹，果冻不裂'],
      'jelly-multi':['连击开裂','一记记加重的连击，最后一击把果冻砸裂'],
      'jelly-offset':['偏击滑移','偏心斜撞，果冻倾斜滑移，球滚落与他物相撞'],
      'tank-full':['风浪','小球入水分化，浪由缓到碎，停机后风平浪静']}[runId];
    badge.innerHTML=`${titles[0]}<small>${titles[1]}</small>`;
    badge.classList.add('show');
    this.director.begin(runId);
    this._simTime=0;
    const duration=DURATIONS[runId];
    let last=performance.now();
    while(this.director && this.director.active===runId && this.director.vtime<duration-1e-6){
      const now=performance.now();
      let dt=Math.min((now-last)/1000,1/20); last=now;
      if(!this.paused) await this.director.advance(dt);
      this._renderScene();
      await new Promise(r=>setTimeout(r,0));
    }
    setTimeout(()=>badge.classList.remove('show'),1200);
    document.querySelectorAll('.demo').forEach(b=>b.classList.remove('active'));
  }

  _resize(){
    this.renderer.setSize(innerWidth,innerHeight);
    this.jelly.resize(); if(this.tank) this.tank.resize();
  }

  _loop(t){
    requestAnimationFrame(tt=>this._loop(tt));
    if(this.exporting){ this.lastT=t; return; }
    let dt=Math.min((t-this.lastT)/1000,1/20); this.lastT=t;
    if(!this.paused && (!this.director.active) && !this._tankBusy){
      const scale=this.slow?0.25:1;
      const h=dt*scale;
      if(this.current==='jelly'){
        this.jelly.advance(h);
      }else if(this.tank){
        this._tankAcc=(this._tankAcc||0)+h;
        if(this._tankAcc>=1/24){
          const step=Math.min(this._tankAcc,1/12); this._tankAcc=0;
          this._tankBusy=true;
          this.tankSim.advance(step,true).then(()=>{
            this.tank.sync(step);
            this._handleTankEvents();
            this._tankBusy=false;
          });
        }
      }
    }
    this._renderScene();
  }

  _renderScene(){
    if(this.current==='jelly') this.jelly.render();
    else if(this.tank) this.tank.render();
  }

  /* ================= 逐帧导出接口 ================= */
  _installExport(){
    let frames=0, fps=60;
    window.videoExport={
      runs:RUNS.slice(),
      async begin(runId,opts){
        fps=(opts&&opts.fps)||60;
        frames=Math.round(DURATIONS[runId]*fps);
        document.body.classList.add('exporting');
        this.exporting=true;
        this.director.begin(runId);
        this._simTime=0;
        // 让缓冲完成初始若干步（初态即第0帧，直接 render）
        await this.director.advance(0);
        this._renderScene();
        return {frames};
      },
      async frame(i){
        const target=i/fps;
        // 导演可能因慢放需要多步；advance 到目标视频时间
        const def=this.director.def;
        let guard=0;
        while(this.director.vtime<target-1e-7 && guard++<400){
          await this.director.advance(Math.min(1/fps,target-this.director.vtime));
        }
        this._renderScene();
        await this.renderer.domElement.__noop?.();
      },
      end(){
        this.exporting=false;
        this.director.active=null;
        document.body.classList.remove('exporting');
      }
    };
  }
}

const app=new App();
app.boot();
window.app=app;
