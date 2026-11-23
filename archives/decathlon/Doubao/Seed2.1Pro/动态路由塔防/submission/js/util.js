/* ================= 全局命名空间与工具 ================= */
var G = {};
(function(){
'use strict';

/* ---------- 数学 ---------- */
G.clamp = function(v,a,b){return v<a?a:(v>b?b:v);};
G.lerp = function(a,b,t){return a+(b-a)*t;};
G.easeInOut = function(t){return t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;};
G.easeOut = function(t){return 1-Math.pow(1-t,3);};
G.dist2D = function(a,b){var dx=a.x-b.x,dz=(a.z!==undefined?a.z:a.y)-(b.z!==undefined?b.z:b.y);return Math.sqrt(dx*dx+dz*dz);};
G.angleLerp = function(a,b,t){var d=((b-a+Math.PI*3)%(Math.PI*2))-Math.PI;return a+d*t;};

/* 确定性随机（演示/导出用） */
function mulberry32(seed){
  return function(){
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
G.RNG = mulberry32;
G.uid = (function(){var i=1;return function(){return i++;};})();

/* ---------- 简易补间 ---------- */
G.Tweens = [];
G.tween = function(obj, to, dur, opts){
  opts = opts || {};
  G.Tweens.push({o:obj,to:to,dur:dur||0.3,t:0,
    ease:opts.ease||G.easeInOut,delay:opts.delay||0,onDone:opts.onDone,yoyo:opts.yoyo,repeat:opts.repeat||0});
};
G.updateTweens = function(dt){
  for(var i=G.Tweens.length-1;i>=0;i--){
    var tw=G.Tweens[i];
    if(tw.delay>0){tw.delay-=dt;continue;}
    tw.t+=dt;
    var k=G.clamp(tw.t/tw.dur,0,1), e=tw.ease(k);
    for(var key in tw.to){
      var from = tw['f_'+key];
      if(from===undefined){from=tw.o[key];tw['f_'+key]=from;}
      tw.o[key]=G.lerp(from,tw.to[key],e);
    }
    if(k>=1){
      if(tw.yoyo && tw.repeat>0){
        var f={};for(var kk in tw.to){f[kk]=tw['f_'+kk];}
        tw['f_'+key]=undefined;
        var newTo={};for(var k2 in tw.to){newTo[k2]=f[k2];}
        tw.to=newTo;tw.t=0;tw.repeat--;
      }else{
        if(tw.onDone)tw.onDone();
        G.Tweens.splice(i,1);
      }
    }
  }
};

/* ---------- Dijkstra（多出口） ---------- */
/* edges: [{a,b,cost}]；返回 dist, prev(节点id) 以及从每个节点到最近出口的总花费 */
G.dijkstra = function(nodes, edges, isBlockedNode, exitIds, edgeExtra){
  var adj={}, dist={}, prev={}, used={};
  nodes.forEach(function(n){adj[n.id]=[];dist[n.id]=Infinity;});
  edges.forEach(function(ed,idx){
    if(!isBlockedNode(ed.a) && !isBlockedNode(ed.b)){
      var c = ed.cost + (edgeExtra?edgeExtra(ed):0);
      adj[ed.a].push({to:ed.b,c:c,e:idx});
      adj[ed.b].push({to:ed.a,c:c,e:idx});
    }
  });
  var Q=new Set(nodes.map(function(n){return n.id;}));
  exitIds.forEach(function(id){ if(dist[id]!==undefined) dist[id]=0; });
  while(Q.size){
    var u=null,bd=Infinity;
    Q.forEach(function(id){ if(dist[id]<bd){bd=dist[id];u=id;} });
    if(u===null)break;
    Q.delete(u);
    adj[u].forEach(function(w){
      if(!Q.has(w.to))return;
      var nd=dist[u]+w.c;
      if(nd<dist[w.to]-1e-9){dist[w.to]=nd;prev[w.to]={from:u,e:w.e};}
    });
  }
  return {dist:dist,prev:prev};
};
/* 从入口沿 prev 走到出口，返回节点序列和边序列；不可达返回 null */
G.pathFromPrev = function(prev, startId, exitIds){
  if(dist0(prev,startId,exitIds))return null;
  var nodes=[startId], edges=[];
  var cur=startId, guard=0;
  while(exitIds.indexOf(cur)<0){
    var p=prev[cur];
    if(!p)return null;
    edges.push(p.e);nodes.push(p.from);cur=p.from;
    if(++guard>200)return null;
  }
  return {nodes:nodes,edges:edges};
};
function dist0(prev,id,exitIds){
  if(exitIds.indexOf(id)>=0)return false;
  return !prev[id];
}

/* ---------- HTML ---------- */
G.el = function(html){var d=document.createElement('div');d.innerHTML=html.trim();return d.firstChild;};
G.fmt = function(n){return Math.round(n);};

/* ---------- 事件总线 ---------- */
G.Bus = (function(){
  var m={};
  return {on:function(ev,fn){(m[ev]=m[ev]||[]).push(fn);},
    emit:function(ev,d){(m[ev]||[]).forEach(function(f){try{f(d);}catch(e){console.error(e);}});}};
})();

})();
