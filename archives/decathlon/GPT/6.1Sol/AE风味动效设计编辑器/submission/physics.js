/* Fixed-step particle simulation against the very meshes used by the viewport. */
(() => {
  'use strict';
  const F = Forge, T = THREE, P = F.Renderer.prototype;
  const updateScene = P.update;
  const step = 1 / 60;
  const scratch = { a: new T.Vector3(), b: new T.Vector3(), c: new T.Vector3(), hit: new T.Vector3() };

  // Sampling is deliberately independent of playback order, GPU passes and audio.
  P.sampleVisibleGeometry = function(project, time) {
    const oldSuppress = this._suppress, oldSampling = this._geometrySampling;
    this._suppress = true;
    this._geometrySampling = true;
    try {
      updateScene.call(this, project, time);
      for (const layer of this.comp.layers) {
        const object = this.objects.get(layer.id);
        if (!object || layer.role !== 'hero') continue;
        for (const child of object.children) {
          if (child.userData.ghost) child.visible = time < 3.05;
          else if (child.userData.writing) {
            child.visible = time < 2.95;
            const progress = F.evaluate(layer, 'trim', time, this.comp) / 100;
            child.children.forEach((stroke, i) => { stroke.visible = progress * child.children.length > i; });
          } else if (child.isMesh) child.visible = time >= 2.95;
        }
      }
      this.root.updateMatrixWorld(true);
      const meshes = [];
      const visit = (object, visible, layer, path) => {
        visible = visible && object.visible;
        if (!visible || object.userData.ghost || object.userData.dropShadow) return;
        if (object.isMesh && !object.isInstancedMesh && object.geometry.attributes.position) {
          const geometry = object.geometry, position = geometry.attributes.position;
          const world = new Float32Array(position.count * 3), v = new T.Vector3();
          for (let i = 0; i < position.count; i++) {
            v.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
            world.set([v.x, v.y, v.z], i * 3);
          }
          const index = geometry.index ? geometry.index.array.slice() : null;
          meshes.push({ key: layer.id + ':' + path, layer: layer.id, world, index,
            bounds: new T.Box3().setFromBufferAttribute(new T.BufferAttribute(world, 3)),
            matrix: object.matrixWorld.clone(), parameters: geometry.parameters || {},
            collision: layer.collisionSurface !== false });
        }
        object.children.forEach((child, i) => visit(child, visible, layer, path + '/' + i));
      };
      for (const layer of this.comp.layers) {
        if (!['text', 'shape', 'geometry', 'precomp'].includes(layer.type)) continue;
        const object = this.objects.get(layer.id);
        if (object) visit(object, true, layer, '');
      }
      return { meshes, comp: this.comp, time };
    } finally {
      this._suppress = oldSuppress;
      this._geometrySampling = oldSampling;
    }
  };

  const read = (mesh, vertex, out) => out.fromArray(mesh.world, vertex * 3);
  function triangles(mesh) {
    const count = mesh.index ? mesh.index.length : mesh.world.length / 3, result = [];
    for (let i = 0; i + 2 < count; i += 3) {
      const ids = mesh.index ? [mesh.index[i], mesh.index[i + 1], mesh.index[i + 2]] : [i, i + 1, i + 2];
      const a = read(mesh, ids[0], new T.Vector3()), b = read(mesh, ids[1], new T.Vector3()), c = read(mesh, ids[2], new T.Vector3());
      const cross = b.clone().sub(a).cross(c.clone().sub(a)), area = cross.length() * .5;
      if (area > 1e-9) result.push({ mesh, ids, a, b, c, area, normal: cross.normalize() });
    }
    return result;
  }

  // A triangle grid is rebuilt from current world-space vertices. Very large floor
  // triangles remain in a separate list instead of filling millions of grid cells.
  function collisionGrid(snapshot, previous) {
    const cell = .65, cells = new Map(), large = [], prior = new Map(previous.meshes.map(m => [m.key, m]));
    const key = (x, y, z) => x + ',' + y + ',' + z;
    for (const mesh of snapshot.meshes) {
      if (!mesh.collision) continue;
      for (const triangle of triangles(mesh)) {
        triangle.previous = prior.get(mesh.key);
        const bounds = new T.Box3().setFromPoints([triangle.a, triangle.b, triangle.c]).expandByScalar(.035);
        const min = bounds.min.clone().divideScalar(cell).floor(), max = bounds.max.clone().divideScalar(cell).floor();
        if ((max.x - min.x + 1) * (max.y - min.y + 1) * (max.z - min.z + 1) > 180) { large.push(triangle); continue; }
        for (let x = min.x; x <= max.x; x++) for (let y = min.y; y <= max.y; y++) for (let z = min.z; z <= max.z; z++) {
          const id = key(x, y, z);
          if (!cells.has(id)) cells.set(id, []);
          cells.get(id).push(triangle);
        }
      }
    }
    return {
      query(from, to) {
        const min = from.clone().min(to).addScalar(-.04).divideScalar(cell).floor();
        const max = from.clone().max(to).addScalar(.04).divideScalar(cell).floor();
        const list = new Set(large);
        for (let x = min.x; x <= max.x; x++) for (let y = min.y; y <= max.y; y++) for (let z = min.z; z <= max.z; z++) {
          for (const triangle of cells.get(key(x, y, z)) || []) list.add(triangle);
        }
        return list;
      }
    };
  }

  function collide(from, to, velocity, grid, restitution, friction) {
    let nearest = null, best = Infinity;
    for (const triangle of grid.query(from, to)) {
      const { a, b, c, normal, previous, ids } = triangle;
      const surfaceDelta = new T.Vector3();
      if (previous && previous.world.length === triangle.mesh.world.length) {
        read(previous, ids[0], scratch.a); read(previous, ids[1], scratch.b); read(previous, ids[2], scratch.c);
        surfaceDelta.copy(a).add(b).add(c).sub(scratch.a).sub(scratch.b).sub(scratch.c).multiplyScalar(1 / 3);
      }
      const start = from.clone().add(surfaceDelta), delta = to.clone().sub(start), distance = delta.length();
      if (distance < 1e-8) continue;
      const ray = new T.Ray(start, delta.clone().divideScalar(distance));
      if (!ray.intersectTriangle(a, b, c, false, scratch.hit)) continue;
      const hitDistance = start.distanceTo(scratch.hit);
      if (hitDistance > distance + .025 || hitDistance / distance >= best) continue;
      const n = normal.clone();
      if (n.dot(delta) > 0) n.negate();
      best = hitDistance / distance;
      nearest = { point: scratch.hit.clone(), normal: n, surfaceVelocity: surfaceDelta.divideScalar(step), layer: triangle.mesh.layer };
    }
    if (!nearest) return null;
    const relative = velocity.clone().sub(nearest.surfaceVelocity), vn = relative.dot(nearest.normal);
    const tangent = relative.clone().addScaledVector(nearest.normal, -vn).multiplyScalar(1 - friction);
    velocity.copy(tangent).addScaledVector(nearest.normal, Math.abs(vn) * restitution).add(nearest.surfaceVelocity);
    to.copy(nearest.point).addScaledVector(nearest.normal, .022);
    return nearest;
  }

  function fieldForce(position, layer, time, comp, index) {
    const e = p => F.evaluate(layer, p, time, comp), center = new T.Vector3(e('x'), e('y'), e('z'));
    const direction = position.clone().sub(center), distance = direction.length();
    const amount = e('force') * Math.max(0, 1 - distance / Math.max(.01, e('radius')));
    if (layer.fieldType === 'vortex') return new T.Vector3(-direction.y, direction.x, 0).multiplyScalar(amount);
    if (layer.fieldType === 'noise') return new T.Vector3(Math.sin(time * 7 + index), Math.cos(time * 9 + index), Math.sin(time * 5)).multiplyScalar(amount);
    return direction.normalize().multiplyScalar(amount);
  }

  function emissionSurface(snapshot, sourceId, emitter, seed, region) {
    const meshes = snapshot.meshes.filter(m => m.layer === sourceId || m.layer.startsWith(sourceId + '/'));
    let candidates = meshes.flatMap(triangles), total = 0, edges = [], edgeLength = 0;
    if (emitter.mode === 'curve') {
      const table = new Map(), vertexKey = v => [v.x,v.y,v.z].map(n=>Math.round(n*10000)).join(',');
      for (const triangle of candidates) for (const [a,b] of [[triangle.a,triangle.b],[triangle.b,triangle.c],[triangle.c,triangle.a]]) {
        const ends = [vertexKey(a),vertexKey(b)].sort(), key = ends.join('|');
        if (!table.has(key)) table.set(key,{a,b,normal:triangle.normal,count:1});
        else { const edge = table.get(key); edge.count++; edge.crease = edge.normal.dot(triangle.normal) < .94; }
      }
      for (const edge of table.values()) if (edge.count === 1 || edge.crease) {
        edge.length=edge.a.distanceTo(edge.b); edgeLength+=edge.length; edges.push(edge);
      }
    }
    for (const triangle of candidates) {
      const center = triangle.a.clone().add(triangle.b).add(triangle.c).multiplyScalar(1 / 3);
      const weight = region ? .01 + Math.exp(-center.distanceToSquared(region.center) / (region.radius ** 2)) : 1;
      triangle.weight = triangle.area * weight;
      total += triangle.weight;
    }
    return index => {
      const r = seed + index * 13.913;
      if (edges.length) {
        let pick=F.rand(r+1)*edgeLength, edge=edges.at(-1);
        for(const item of edges){pick-=item.length;if(pick<=0){edge=item;break}}
        return {point:edge.a.clone().lerp(edge.b,F.rand(r+2)),normal:edge.normal.clone()};
      }
      if (!candidates.length) return { point: emitter.point.clone(), normal: new T.Vector3(0, 1, 0) };
      let pick = F.rand(r + 1) * total, triangle = candidates.at(-1);
      for (const item of candidates) { pick -= item.weight; if (pick <= 0) { triangle = item; break; } }
      let u = Math.sqrt(F.rand(r + 2)), v = F.rand(r + 3);
      return { point: triangle.a.clone().multiplyScalar(1 - u).addScaledVector(triangle.b, u * (1 - v)).addScaledVector(triangle.c, u * v), normal: triangle.normal.clone() };
    };
  }

  P.buildParticleEvent = function(project, emitter, comp, event) {
    const e = (p, t = event) => F.evaluate(emitter, p, t, comp);
    const duration = Math.max(.05, e('life')), burst = !emitter.continuous;
    const count = Math.min(500, Math.max(1, Math.round(e('rate') * (burst ? 1 : .25))));
    const seed = e('seed') + event * 319.17, frames = Math.min(Math.ceil(duration / step) + 1,Math.ceil(Math.max(0,comp.duration-event)/step)+2);
    let initial = this.sampleVisibleGeometry(project, event);
    let emitterObject = this.objects.get(emitter.id), emitterPoint = emitterObject ? emitterObject.position.clone() : new T.Vector3(e('x'), e('y'), e('z'));
    const region = emitter.regionEnabled ? { center: new T.Vector3(e('regionX'), e('regionY'), e('regionZ')), radius: e('regionRadius') || 1.5 } : null;
    const sample = emissionSurface(initial, emitter.emitMode === 'point' ? '' : emitter.source || '', {point:emitterPoint,mode:emitter.emitMode}, seed, region);
    const paths = [], particles = [], stats = { emitted: count, collisions: 0, secondary: 0, triangleCount: initial.meshes.reduce((n, m) => n + (m.index?.length || m.world.length / 3) / 3, 0) };
    for (let i = 0; i < count; i++) {
      const r = seed + i * 13.913, surface = sample(i), speed = e('speed');
      const point = surface.point.clone().addScaledVector(surface.normal, .028);
      const velocity = new T.Vector3((F.rand(r + 5) - .5) * speed * 2, (.25 + F.rand(r + 6)) * speed, (F.rand(r + 7) - .4) * speed)
        .addScaledVector(surface.normal, speed * .28);
      const life = duration * (.55 + .45 * F.rand(r + 8));
      const path = { birth: 0, life, points: [point.clone()], collisionAt: -1, secondary: false };
      paths.push(path); particles.push({ point, velocity, path, index: i, active: true });
    }
    let previous = initial;
    for (let frame = 1; frame <= frames; frame++) {
      const age = frame * step, time = event + age;
      if (!particles.some(p => p.active)) break;
      const current = emitter.collision ? this.sampleVisibleGeometry(project, time) : previous;
      const grid = emitter.collision ? collisionGrid(current, previous) : null;
      const fields = comp.layers.filter(l => l.type === 'field' && l.visible && time >= l.in && time <= l.out);
      const additions = [];
      for (const particle of particles) {
        const { point, velocity, path, index } = particle;
        if (!particle.active || age > path.birth + path.life) { particle.active = false; continue; }
        const from = point.clone();
        velocity.y -= e('gravity', time) * step;
        velocity.addScaledVector(new T.Vector3(e('windX', time), e('windY', time), e('windZ', time)), step);
        for (const field of fields) velocity.addScaledVector(fieldForce(point, field, time, comp, index), step);
        velocity.multiplyScalar(Math.exp(-Math.max(0, e('drag', time)) * step));
        point.addScaledVector(velocity, step);
        const collision = grid && collide(from, point, velocity, grid,
          e('restitution',time), e('friction',time));
        if (collision) {
          stats.collisions++;
          if (path.collisionAt < 0) path.collisionAt = age - path.birth;
          if (emitter.secondary && !path.secondary && index % 5 === 0 && !particle.spawned) {
            particle.spawned = true;
            for (let child = 0; child < 2; child++) {
              const r = seed + index * 17 + child * 31, p = point.clone();
              const v = collision.normal.clone().multiplyScalar(1.1 + F.rand(r) * 1.7)
                .add(new T.Vector3((F.rand(r + 1) - .5) * 2, F.rand(r + 2), (F.rand(r + 3) - .5) * 2));
              const secondary = { birth: age, life: Math.min(.55, duration * .3), points: [p.clone()], collisionAt: 0, secondary: true };
              paths.push(secondary); additions.push({ point: p, velocity: v, path: secondary, index: count + stats.secondary++, active: true });
            }
          }
        }
        path.points.push(point.clone());
      }
      particles.push(...additions);
      previous = current;
    }
    return { paths, stats };
  };

  // Keep the existing ribbon renderer: only replace its input with sampled physics.
  P.updateParticles = function(layer, time, comp) {
    if (this._geometrySampling) return;
    const project = this.sourceProject || this.project;
    const signature = JSON.stringify(project);
    if (this.physicsSignature !== signature) { this.physicsSignature = signature; this.physicsEvents = new Map(); }
    const cache = this.physicsEvents, e = p => F.evaluate(layer, p, time, comp);
    let events = layer.events || [layer.in];
    if (layer.continuous) { events = []; for (let t = layer.in; t <= time + 1e-8; t += .25) events.push(+t.toFixed(6)); }
    let changedScene = false;
    const activeEvents = [];
    try {
      for (const event of events) {
        if (event > time || time - event > F.evaluate(layer, 'life', event, comp) + .6) continue;
        const key = layer.id + ':' + event;
        if (!cache.has(key)) { changedScene = true; cache.set(key, this.buildParticleEvent(project, layer, comp, event)); }
        activeEvents.push({ event, data: cache.get(key) });
      }
    } finally {
      if (changedScene) this.sampleVisibleGeometry(project, time);
    }
    const object = this.objects.get(layer.id), geometry = object?.children[0]?.geometry;
    if (!geometry) return;
    const position = geometry.attributes.position, color = geometry.attributes.color;
    geometry.userData.lifeScales = [];
    let n = 0, activeParticles = 0, secondaryCount = 0, collisionCount = 0;
    const start = new T.Color(layer.material.color || '#ffad48'), end = new T.Color(layer.endColor || '#e14517');
    for (const { event, data } of activeEvents) {
      collisionCount += data.stats.collisions; secondaryCount += data.stats.secondary;
      for (const path of data.paths) {
        const age = time - event - path.birth;
        if (age < 0 || age > path.life || n + 2 > position.count) continue;
        const frame = age / step, index = Math.min(path.points.length - 1, Math.floor(frame));
        const p = path.points[index].clone().lerp(path.points[Math.min(index + 1, path.points.length - 1)], frame - Math.floor(frame));
        const life = age / path.life, fade = (1 - life) ** 1.3;
        const c = start.clone().lerp(end, F.clamp(life + (path.collisionAt >= 0 && age >= path.collisionAt ? .35 : 0), 0, 1)).multiplyScalar(2 * fade);
        const tailFrames = Math.max(1,Math.min(32,Math.round(Math.max(0,e('trail'))/step)));
        const last = Math.max(0,index-tailFrames);
        let previousPoint=p;
        activeParticles++;
        for(let j=index;j>=last&&n+2<=position.count;j--){
          const next=path.points[j], along=(index-j)/(tailFrames+1), brightness=(1-along)**1.8;
          if(previousPoint.distanceToSquared(next)<1e-10){previousPoint=next;continue}
          geometry.userData.lifeScales[n/2] = F.mix(1,e('sizeEnd')/100,life)*Math.sqrt(1-along);
          position.setXYZ(n,previousPoint.x,previousPoint.y,previousPoint.z);color.setXYZ(n++,c.r*brightness,c.g*brightness,c.b*brightness);
          position.setXYZ(n,next.x,next.y,next.z);color.setXYZ(n++,c.r*brightness*.85,c.g*brightness*.85,c.b*brightness*.85);
          previousPoint=next;
        }
      }
    }
    geometry.setDrawRange(0, n); position.needsUpdate = color.needsUpdate = true; geometry.computeBoundingSphere();
    this.physicsStats = { active: activeParticles, segments: n / 2, secondary: secondaryCount, collisions: collisionCount, cachedEvents: cache.size };

    this.uploadParticleRibbons(layer, geometry, object, time, comp);
  };

  P.uploadParticleRibbons = function(layer, sourceGeometry, object, time, comp) {
    let ribbon = object.userData.ribbon;
    if (!ribbon) {
      const geometry = new T.InstancedBufferGeometry();
      geometry.setAttribute('position', new T.Float32BufferAttribute([-.5,0,0,.5,0,0,-.5,1,0,.5,1,0],3));
      geometry.setAttribute('uv', new T.Float32BufferAttribute([0,0,1,0,0,1,1,1],2));
      geometry.setIndex([0,1,2,2,1,3]);
      for (const attr of ['sparkStart','sparkEnd','sparkColor']) geometry.setAttribute(attr,new T.InstancedBufferAttribute(new Float32Array(24000),3));
      geometry.setAttribute('sparkScale',new T.InstancedBufferAttribute(new Float32Array(8000),1));
      const material = new T.ShaderMaterial({ transparent:true, depthWrite:false, depthTest:true, blending:T.AdditiveBlending,
        uniforms:{sparkWidth:{value:.025},sparkOpacity:{value:1}},
        vertexShader:`attribute vec3 sparkStart,sparkEnd,sparkColor;attribute float sparkScale;uniform float sparkWidth;varying vec2 sparkUV;varying vec3 colorOut;
          void main(){vec3 mid=(sparkStart+sparkEnd)*.5;vec3 direction=normalize(sparkEnd-sparkStart+vec3(0.,.0001,0.));vec3 side=normalize(cross(direction,cameraPosition-mid));vec3 world=mix(sparkStart,sparkEnd,uv.y)+side*position.x*sparkWidth*sparkScale;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.);sparkUV=uv;colorOut=sparkColor;}`,
        fragmentShader:`uniform float sparkOpacity;varying vec2 sparkUV;varying vec3 colorOut;void main(){float edge=1.-abs(sparkUV.x-.5)*2.;float alpha=pow(edge,.65)*mix(1.,.85,sparkUV.y);gl_FragColor=vec4(colorOut,alpha*sparkOpacity);}` });
      ribbon = new T.Mesh(geometry, material); ribbon.frustumCulled = false;
      object.add(ribbon); object.userData.ribbon = ribbon;
    }
    object.children[0].visible = false;
    const p = sourceGeometry.attributes.position, c = sourceGeometry.attributes.color, count = Math.min(8000, sourceGeometry.drawRange.count / 2), geometry = ribbon.geometry;
    for (let i = 0; i < count; i++) {
      geometry.attributes.sparkStart.setXYZ(i,p.getX(i*2),p.getY(i*2),p.getZ(i*2));
      geometry.attributes.sparkEnd.setXYZ(i,p.getX(i*2+1),p.getY(i*2+1),p.getZ(i*2+1));
      geometry.attributes.sparkColor.setXYZ(i,c.getX(i*2),c.getY(i*2),c.getZ(i*2));
      geometry.attributes.sparkScale.setX(i,sourceGeometry.userData.lifeScales?.[i]??1);
    }
    for (const attr of ['sparkStart','sparkEnd','sparkColor','sparkScale']) geometry.attributes[attr].needsUpdate=true;
    geometry.instanceCount=count; ribbon.material.uniforms.sparkWidth.value=F.evaluate(layer,'size',time,comp);ribbon.material.uniforms.sparkOpacity.value=F.evaluate(layer,'opacity',time,comp)/100;
  };
})();
