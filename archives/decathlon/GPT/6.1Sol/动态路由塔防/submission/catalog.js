'use strict';
// The handbook illustrations are renders of the actual game models, generated
// locally rather than separate assets that can drift from gameplay visuals.
const Catalog={cache:new Map(),
 image(kind,type,level=1,branch=null){
  const key=[kind,type,level,branch].join('/');if(this.cache.has(key))return this.cache.get(key);
  const renderer=View.renderer,size=renderer.getSize(new THREE.Vector2()),ratio=renderer.getPixelRatio(),studio=new THREE.Scene();studio.background=new THREE.Color(0x142d37);
  const camera=new THREE.PerspectiveCamera(33,1.2,.1,30),boss=type.startsWith('boss');camera.position.set(boss?3.1:2.5,boss?2.9:2.1,boss?-4.1:-3.2);camera.lookAt(0,boss?1:.6,0);
  studio.add(new THREE.HemisphereLight(0xe2f1ef,0x2b414e,3.6));const sun=new THREE.DirectionalLight(0xf1ead9,4);sun.position.set(-3,5,-4);studio.add(sun);const rim=new THREE.DirectionalLight(0x76cfc8,2);rim.position.set(3,2,2);studio.add(rim);
  let model,url;
  try{
   model=kind==='tower'?View.makeTower(type,{x:0,z:0,type:'pad',k:'catalog'},level,branch):View.makeEnemy(type);studio.add(model.g);model.g.position.set(0,0,0);model.g.rotation.y=.25;model.hp.g.visible=false;model.shield.visible=false;if(model.lockLabel)model.lockLabel.visible=false;if(model.phaseLabel)model.phaseLabel.visible=false;if(model.link)model.link.visible=false;
   if(type==='trojan'){model.parts.covers.forEach((g,i)=>g.rotation.z=(i?1:-1)*1.15);model.parts.payload.visible=true;model.parts.head.material=View.mat(0xe6b672,0x513313);}
   View.cylinder(studio,0,-.08,0,boss?.85:.56,.08,0x233f49,0,true);
   renderer.setPixelRatio(1);renderer.setSize(288,240,false);renderer.render(studio,camera);url=renderer.domElement.toDataURL('image/png');this.cache.set(key,url);
  }finally{
   if(model)Visuals.dispose(model.g);for(const child of [...studio.children])if(child.isMesh)studio.remove(child);
   renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);View.render(0,View.time);
  }return url;
 },
 decorate(tab){
  const entries=document.querySelectorAll('#modalContent .codex-entry'),list=Object.keys(tab==='devices'?Data.towers:Data.enemies);if(!['devices','threats'].includes(tab))return;
  entries.forEach((el,i)=>{const type=list[i];if(!type)return;const img=document.createElement('img');img.className='catalog-model';img.alt=(tab==='devices'?Data.towers[type]:Data.enemies[type]).name+' · 实际三维模型';img.src=this.image(tab==='devices'?'tower':'enemy',type);el.prepend(img);});
 },
 branches(t){document.querySelectorAll('#modalContent .demo-choice').forEach((el,i)=>{const b=Data.towers[t.type].branches[i];if(!b)return;el.querySelector('span').innerHTML='<img class="branch-model" alt="'+b.name+'升级模型" src="'+this.image('tower',t.type,2,b.id)+'">';});}
};
