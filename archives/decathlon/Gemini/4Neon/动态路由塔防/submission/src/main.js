import { GameEngine } from './core/engine.js';
import { GameScene } from './render/scene.js';
import { SoundEngine } from './audio/audio.js';
import { UIManager } from './ui/ui.js';
import { DEMO_DEFS, DemoDirector } from './data/demos.js';
import { MAPS } from './data/maps.js';

function nextPaint() {
  return new Promise((resolve) => {
    // Force DOM layout flush then wait for compositor frame (fallback timeout in case background tab)
    void document.body.offsetHeight;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(() => requestAnimationFrame(finish));
    setTimeout(finish, 50);
  });
}

function bootstrap() {
  const canvas = document.getElementById('game-canvas');
  const engine = new GameEngine();
  const scene = new GameScene(canvas);
  const audio = new SoundEngine();

  let activeMapId = MAPS[0].id;
  let inMenu = true;
  let demoQueue = [];
  let demoDirector = null;

  const exportState = {
    active: false,
    runId: null,
    fps: 30,
    currentTime: 0,
    frames: 0,
  };

  const ui = new UIManager({
    engine,
    scene,
    audio,
    callbacks: {
      onStartMap(mapId) {
        demoQueue = [];
        demoDirector.stop();
        inMenu = false;
        activeMapId = mapId;
        engine.loadMap(mapId, (Date.now() & 0xfffffff) || 0x51a7c0de, { demoMode: false });
        scene.loadMap(engine);
        ui.showGameplayHUD(engine.map);
        audio.setTheme(engine.map.theme.musicTheme);
      },
      onStartDemo(idOrAll) {
        inMenu = false;
        if (idOrAll === 'all') {
          demoQueue = ['demo-2', 'demo-3'];
          startInteractiveDemo('demo-1');
        } else {
          demoQueue = [];
          startInteractiveDemo(idOrAll);
        }
      },
      onExitDemo() {
        demoQueue = [];
        demoDirector.stop();
        returnToMenu();
      },
      onRestartMap() {
        demoQueue = [];
        demoDirector.stop();
        inMenu = false;
        engine.loadMap(activeMapId, (Date.now() & 0xfffffff) || 0x51a7c0de, { demoMode: false });
        scene.loadMap(engine);
        ui.showGameplayHUD(engine.map);
        audio.setTheme(engine.map.theme.musicTheme);
      },
      onReturnMenu() {
        demoQueue = [];
        demoDirector.stop();
        returnToMenu();
      },
      onTogglePause() {
        if (engine.status !== 'playing' || engine.demoMode) return;
        engine.paused = !engine.paused;
      },
      onSetPaused(val) {
        if (engine.status !== 'playing' || engine.demoMode) return;
        engine.paused = !!val;
      },
      onToggleSpeed() {
        if (engine.demoMode) return;
        engine.speedMult = engine.speedMult === 1 ? 2 : 1;
      },
    },
  });

  demoDirector = new DemoDirector(engine, scene, ui);

  function startInteractiveDemo(runId) {
    ui.clearSelection();
    ui.cancelDrag();
    const def = demoDirector.start(runId);
    if (!def) return;
    activeMapId = def.mapId;
    ui.showGameplayHUD(engine.map);
    audio.setTheme(engine.map.theme.musicTheme);
  }

  function returnToMenu() {
    inMenu = true;
    engine.loadMap('intranet', 0x51a7c0de, { demoMode: true });
    scene.loadMap(engine);
    ui.showMenu();
    audio.setTheme('menu');
  }

  // Initial scenic 3D cyberspace backdrop behind Main Menu!
  returnToMenu();

  // Unlock Web Audio on first user gesture anywhere (Section 4.3)
  const unlockOnce = () => {
    audio.unlock();
    window.removeEventListener('pointerdown', unlockOnce);
    window.removeEventListener('keydown', unlockOnce);
  };
  window.addEventListener('pointerdown', unlockOnce);
  window.addEventListener('keydown', unlockOnce);

  window.addEventListener('resize', () => {
    scene.resize(window.innerWidth, window.innerHeight);
  });

  // ==================== REAL-TIME MAIN LOOP ====================
  let lastTs = performance.now();
  let menuSpinTime = 0;

  function tick(now) {
    requestAnimationFrame(tick);
    if (exportState.active) {
      lastTs = now;
      return;
    }

    const rawDt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
    lastTs = now;

    if (inMenu) {
      menuSpinTime += rawDt;
      scene.setCameraPose(
        {
          tx: 0,
          ty: 0,
          tz: 0.5,
          yaw: Math.sin(menuSpinTime * 0.14) * 0.45,
          pitch: 0.78 + Math.sin(menuSpinTime * 0.11) * 0.06,
          distance: 35.5,
        },
        true
      );
      scene.syncAndRender(engine, [], menuSpinTime, rawDt);
      return;
    }

    if (demoDirector.active) {
      // Live Demo runs strictly at normal 1x speed (Section 2.13)
      let remain = rawDt;
      const events = [];
      while (remain > 1e-6) {
        const sub = Math.min(1 / 60, remain);
        demoDirector.step(sub);
        engine.step(sub);
        events.push(...engine.drainEvents());
        remain -= sub;
      }
      for (const ev of events) audio.handleEngineEvent(ev);
      ui.handleEngineEvents(events);
      scene.syncAndRender(engine, events, engine.simTime, rawDt);
      ui.updateFrame(rawDt);

      if (demoDirector.elapsed >= demoDirector.def.duration) {
        if (demoQueue.length > 0) {
          const nextId = demoQueue.shift();
          startInteractiveDemo(nextId);
        } else {
          demoDirector.stop();
          returnToMenu();
        }
      }
      return;
    }

    // Standard Playable Mode
    const simDt = engine.paused || engine.status !== 'playing' ? 0 : rawDt * engine.speedMult;
    const events = [];
    if (simDt > 0) {
      let remain = simDt;
      while (remain > 1e-6) {
        const sub = Math.min(1 / 60, remain);
        engine.step(sub);
        events.push(...engine.drainEvents());
        remain -= sub;
      }
    } else {
      events.push(...engine.drainEvents());
    }

    for (const ev of events) audio.handleEngineEvent(ev);
    ui.handleEngineEvents(events);
    // Pause freezes all combat/entity/VFX time uniformly (dt = 0) while keeping camera reset responsive (camDt = rawDt)!
    scene.syncAndRender(engine, events, engine.simTime, simDt, rawDt);
    ui.updateFrame(simDt);
  }

  requestAnimationFrame(tick);

  // ==================== FIXED DETERMINISTIC VIDEO EXPORT API (Section 2.15) ====================
  window.videoExport = {
    runs: DEMO_DEFS.map((d) => d.id), // ['demo-1', 'demo-2', 'demo-3']

    async begin(runId, { fps = 30 } = {}) {
      const def = DEMO_DEFS.find((d) => d.id === runId);
      if (!def) throw new Error(`Unknown videoExport runId: ${runId}`);

      exportState.active = true;
      exportState.runId = runId;
      exportState.fps = Math.max(1, Number(fps) || 30);
      exportState.currentTime = 0;
      exportState.frames = Math.round(def.duration * exportState.fps) + 1;

      audio.silentExport = true;
      audio.stopTheme();
      demoQueue = [];
      inMenu = false;

      // Adapt immediately to caller viewport (up to 3840x2160)
      scene.resize(window.innerWidth, window.innerHeight);

      demoDirector.start(runId);
      ui.showGameplayHUD(engine.map);
      ui.clearSelection();
      demoDirector.updateChoreography(0);
      ui.updateFrame(0);
      scene.syncAndRender(engine, [], 0, 0.001);

      const gl = scene.renderer.getContext();
      gl?.finish?.();
      await nextPaint();
      return { frames: exportState.frames };
    },

    async frame(i) {
      if (!exportState.active) throw new Error('videoExport.begin() must be called before frame()');

      // Re-adapt if caller resized window between frames
      if (scene.viewportW !== window.innerWidth || scene.viewportH !== window.innerHeight) {
        scene.resize(window.innerWidth, window.innerHeight);
      }

      const targetTime = Math.max(0, i / exportState.fps);
      const deltaTotal = Math.max(0, targetTime - exportState.currentTime);
      exportState.currentTime = targetTime;

      const allEvents = [];
      if (i === 0 || deltaTotal <= 1e-9) {
        demoDirector.updateChoreography(targetTime);
        const ev0 = engine.drainEvents();
        if (ev0.length > 0) ui.handleEngineEvents(ev0);
        scene.syncAndRender(engine, ev0, engine.simTime, 0, 0);
        ui.updateFrame(0);
      } else {
        let remain = deltaTotal;
        let lastSub = 0;
        while (remain > 1e-7) {
          const sub = Math.min(1 / 60, remain);
          lastSub = sub;
          demoDirector.step(sub);
          engine.step(sub);
          const evs = engine.drainEvents();
          if (evs.length > 0) {
            ui.handleEngineEvents(evs);
            for (const ev of evs) {
              if (ev.type === 'route_changed' || ev.type === 'routes_refreshed') {
                scene.vfx.rebuildEntryRoutes(engine.map, engine.entryRoutes, ev.changedEntries || []);
              }
              scene.vfx.handleEngineEvent(engine.map, ev);
            }
          }
          // Step VFX, animations & floating text at exact deterministic rate across all substeps!
          if (remain - sub > 1e-7) {
            scene.vfx.update(engine, engine.simTime, sub);
            for (const ft of ui.floatingTexts) ft.age += sub;
            ui.floatingTexts = ui.floatingTexts.filter((ft) => ft.age < ft.duration);
          }
          remain -= sub;
        }
        demoDirector.updateChoreography(targetTime);
        const tailEvs = engine.drainEvents();
        if (tailEvs.length > 0) ui.handleEngineEvents(tailEvs);
        scene.syncAndRender(engine, tailEvs, engine.simTime, lastSub, lastSub);
        ui.updateFrame(lastSub);
      }

      const gl = scene.renderer.getContext();
      gl?.finish?.();
      await nextPaint();
    },

    end() {
      exportState.active = false;
      exportState.runId = null;
      audio.silentExport = false;
      demoDirector.stop();
      returnToMenu();
    },
  };

  // Optional debug handle for self-verification
  window.__GAME__ = { engine, scene, ui, demoDirector, audio };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
