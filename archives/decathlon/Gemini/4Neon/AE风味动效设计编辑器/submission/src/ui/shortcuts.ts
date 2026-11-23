import { audioEngine } from '../audio/audioEngine';
import { EditorStore } from './store';
import { TimelinePanel } from './timelinePanel';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function bindGlobalShortcuts(store: EditorStore, timeline: TimelinePanel): void {
  // Unlock WebAudio cleanly on first user interaction (4.1)
  const unlockOnce = () => {
    audioEngine.unlock();
  };
  window.addEventListener('pointerdown', unlockOnce, { passive: true });
  window.addEventListener('keydown', unlockOnce, { passive: true });

  window.addEventListener('keydown', (e) => {
    // CRITICAL (2.16): Never steal keystrokes while typing text or expressions!
    if (isTypingTarget(e.target) || store.isExportMode) return;

    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key;
    const lower = key.toLowerCase();

    // Space: Play / Pause
    if (key === ' ' && !ctrl) {
      e.preventDefault();
      store.togglePlay();
      return;
    }

    // F9: Easy Ease
    if (key === 'F9') {
      e.preventDefault();
      timeline.applyEaseToSelected(e.shiftKey ? 'easeOut' : 'ease');
      return;
    }

    // Ctrl+Shift+C: In-Place Precompose!
    if (ctrl && e.shiftKey && lower === 'c') {
      e.preventDefault();
      store.precomposeSelected();
      return;
    }

    // Undo / Redo (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y)
    if (ctrl && lower === 'z' && !e.shiftKey) {
      e.preventDefault();
      store.undo();
      return;
    }
    if ((ctrl && lower === 'y') || (ctrl && e.shiftKey && lower === 'z')) {
      e.preventDefault();
      store.redo();
      return;
    }

    // Ctrl+D: Duplicate selected layers
    if (ctrl && lower === 'd') {
      e.preventDefault();
      store.duplicateSelectedLayers();
      return;
    }

    // Ctrl+C / Ctrl+V: Copy / Paste Keyframes
    if (ctrl && !e.shiftKey && lower === 'c' && store.selectedKeyframeIds.size > 0) {
      e.preventDefault();
      timeline.copySelectedKeyframes();
      return;
    }
    if (ctrl && !e.shiftKey && lower === 'v' && store.clipboardKeyframes.length > 0) {
      e.preventDefault();
      timeline.pasteKeyframes();
      return;
    }

    // Delete / Backspace: Delete selected keyframes first, else selected layers
    if (key === 'Delete' || key === 'Backspace') {
      e.preventDefault();
      if (!timeline.deleteSelectedKeyframes()) {
        store.deleteSelectedLayers();
      }
      return;
    }

    // Frame Stepping & Keyframe Jump
    if (key === 'ArrowLeft' || key === 'PageUp') {
      e.preventDefault();
      store.stepFrames(e.shiftKey ? -10 : -1);
      return;
    }
    if (key === 'ArrowRight' || key === 'PageDown') {
      e.preventDefault();
      store.stepFrames(e.shiftKey ? 10 : 1);
      return;
    }
    if (key === 'Home') {
      e.preventDefault();
      store.setTime(store.getActiveComp().workAreaStart);
      return;
    }
    if (key === 'End') {
      e.preventDefault();
      store.setTime(store.getActiveComp().workAreaEnd);
      return;
    }

    if (!ctrl && !e.altKey) {
      if (lower === 'j') { e.preventDefault(); timeline.jumpKeyframe(-1); return; }
      if (lower === 'k') { e.preventDefault(); timeline.jumpKeyframe(1); return; }
      if (lower === 'b') {
        e.preventDefault();
        const comp = store.getActiveComp();
        store.beginEdit();
        comp.workAreaStart = Math.min(store.currentTime, comp.workAreaEnd - 0.1);
        store.commitEdit(false);
        return;
      }
      if (lower === 'n') {
        e.preventDefault();
        const comp = store.getActiveComp();
        store.beginEdit();
        comp.workAreaEnd = Math.max(store.currentTime, comp.workAreaStart + 0.1);
        store.commitEdit(false);
        return;
      }
      // AE Tool Hotkeys
      if (lower === 'v') { store.activeTool = 'select'; store.notify('ui'); return; }
      if (lower === 'y') { store.activeTool = 'anchor'; store.notify('ui'); return; }
      if (lower === 'w') { store.activeTool = 'rotate'; store.notify('ui'); return; }
      if (lower === 's') { store.activeTool = 'scale'; store.notify('ui'); return; }
      if (lower === 'g') { store.activeTool = 'pen'; store.notify('ui'); return; }
      if (lower === 'r') { store.activeTool = 'rect'; store.notify('ui'); return; }
      if (lower === 'e') { store.activeTool = 'ellipse'; store.notify('ui'); return; }
      if (lower === 't') { store.activeTool = 'text'; store.notify('ui'); return; }
      if (lower === 'p') { store.activeTool = 'puppet'; store.notify('ui'); return; }
      if (lower === 'c') { store.activeTool = 'cameraOrbit'; store.notify('ui'); return; }
    }
  });
}
