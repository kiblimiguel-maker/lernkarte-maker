import { createLibraryDragVisuals } from './library-drag-visuals.mjs';

const tileSelector = '#content [data-sort-id]';
const interactive = 'button, a, summary, details, input, select, textarea, [contenteditable]';
const holdTime = 330;
const springTime = 700;

export function bindLibraryDrag({ identify, targets, resolve, destinations, navigate, cancelNavigation, drop }) {
  let drag;
  let suppressClickUntil = 0;

  function position(state, x, y) {
    if (state.x !== x || state.y !== y) state.dirty = true;
    state.x = x;
    state.y = y;
  }

  function markTargets(state) {
    state.visual.markTargets(targets(state.source));
    state.dirty = true;
    scheduleFrame(state);
  }

  function clearSpring(state) {
    clearTimeout(state.springTimer);
    state.springTimer = null;
    state.springKey = null;
  }

  function recheckAfterLayout(state) {
    if (state.waitingForLayout) return;
    const settled = state.visual.layoutSettled();
    if (!settled) return;
    state.waitingForLayout = true;
    settled.then(() => {
      state.waitingForLayout = false;
      if (drag === state && !state.target) scheduleFrame(state);
    });
  }

  function refreshTarget(state, hit) {
    state.dirty = false;
    if (hit?.closest('.library-drag-slot')) return;
    const candidate = resolve(state.source, hit, state.x, state.y);
    const previous = state.target;
    if (candidate?.element === previous?.element && candidate?.placement === previous?.placement) {
      if (!candidate) recheckAfterLayout(state);
      return;
    }
    state.target = candidate;
    state.visual.preview(candidate?.placement ? candidate.element : null, candidate?.placement);
    state.visual.highlight(candidate?.element, candidate?.label || state.source.hint || 'Ziehe zu einer neuen Position oder in einen Ordner.');
    clearSpring(state);
    if (!candidate) recheckAfterLayout(state);
    if (!candidate?.open) return;
    state.springKey = candidate.key;
    state.springTimer = setTimeout(() => {
      if (drag !== state || state.springKey !== candidate.key || !candidate.element.isConnected) return;
      state.visual.restore(false);
      state.target = null;
      state.navigated = navigate(state.source, candidate) || state.navigated;
      clearSpring(state);
      state.visual.preview(null);
      markTargets(state);
    }, springTime);
  }

  function edgeDelta(point, start, end) {
    const edge = Math.min(64, (end - start) / 3);
    if (point < start + edge) return -Math.min(15, (start + edge - point) * .23);
    if (point > end - edge) return Math.min(15, (point - end + edge) * .23);
    return 0;
  }

  function scroll(state, hit) {
    const bar = state.bar?.contains(hit) ? state.bar : null;
    if (bar) {
      const rect = bar.getBoundingClientRect();
      const delta = edgeDelta(state.x, rect.left, rect.right);
      if (!delta) return false;
      const old = bar.scrollLeft;
      bar.scrollLeft = old + delta;
      return old !== bar.scrollLeft;
    }
    const sidebar = hit?.closest('.app-sidebar');
    if (sidebar) {
      const scroller = state.compactSidebar.matches ? sidebar : sidebar.querySelector('.sidebar-subjects');
      const rect = scroller.getBoundingClientRect();
      const delta = edgeDelta(state.y, rect.top, rect.bottom);
      if (!delta) return false;
      const old = scroller.scrollTop;
      scroller.scrollTop = old + delta;
      return old !== scroller.scrollTop;
    }
    const barTop = state.bar?.getBoundingClientRect().top || window.innerHeight;
    const delta = edgeDelta(state.y, 30, barTop);
    if (!delta) return false;
    const old = window.scrollY;
    window.scrollBy(0, delta);
    return old !== window.scrollY;
  }

  function scheduleFrame(state) {
    if (state.frame != null) return;
    state.frame = requestAnimationFrame(() => {
      state.frame = null;
      if (state !== drag) return;
      const hit = document.elementFromPoint(state.x, state.y);
      const scrolled = scroll(state, hit);
      refreshTarget(state, scrolled ? document.elementFromPoint(state.x, state.y) : hit);
      state.visual.move(state.x, state.y);
      if (scrolled) scheduleFrame(state);
    });
  }

  function start(state) {
    if (state !== drag || !state.tile.isConnected) return;
    clearTimeout(state.holdTimer);
    state.visual = createLibraryDragVisuals(state.tile, { x: state.startX, y: state.startY });
    state.bar = destinations(state.source);
    state.compactSidebar = window.matchMedia('(max-height: 380px)');
    try { document.body.setPointerCapture(state.pointerId); } catch { /* Pointer may have been released. */ }
    markTargets(state);
  }

  function finish(commit = false) {
    if (!drag) return;
    const state = drag;
    drag = null;
    clearTimeout(state.holdTimer);
    clearSpring(state);
    cancelAnimationFrame(state.frame);
    if (!state.visual) return;
    suppressClickUntil = performance.now() + 450;
    if (document.body.hasPointerCapture(state.pointerId)) document.body.releasePointerCapture(state.pointerId);
    state.bar?.remove();
    if (!commit || !state.target) {
      const arrival = state.navigated ? cancelNavigation(state.source) : state.tile;
      state.visual.finish(arrival || null);
      return;
    }
    drop(state.source, state.target, state.visual);
  }

  document.addEventListener('pointerdown', event => {
    if (drag || event.button !== 0 || !event.isPrimary || !(event.target instanceof Element)) return;
    suppressClickUntil = 0;
    const tile = event.target.closest(tileSelector);
    if (!tile) return;
    const control = event.target.closest(interactive);
    if (control && !control.matches('[data-organise-handle], [data-sort-handle]')) return;
    const source = identify(tile);
    if (!source) return;
    const { clientX:x, clientY:y, pointerId, pointerType } = event;
    const state = { source, tile, x, y, pointerId, pointerType, startX:x, startY:y };
    drag = state;
    if (pointerType !== 'mouse') state.holdTimer = setTimeout(() => start(state), holdTime);
  });

  document.addEventListener('pointermove', event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const state = drag;
    position(state, event.clientX, event.clientY);
    if (state.visual) {
      if (state.dirty) scheduleFrame(state);
      return;
    }
    if (Math.hypot(state.x - state.startX, state.y - state.startY) < (state.pointerType === 'mouse' ? 7 : 9)) return;
    if (state.pointerType === 'mouse') start(state);
    else finish();
  });

  // An active touch drag owns movement. Before the hold elapses, native page
  // scrolling can take over and cancel the pending gesture.
  document.addEventListener('touchmove', event => {
    if (drag?.visual && drag.pointerType === 'touch' && event.cancelable) event.preventDefault();
  }, { passive: false });

  document.addEventListener('pointerup', event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    position(drag, event.clientX, event.clientY);
    if (drag.visual) {
      if (drag.dirty || drag.frame != null || drag.waitingForLayout) refreshTarget(drag, document.elementFromPoint(drag.x, drag.y));
      drag.visual.move(drag.x, drag.y);
    }
    finish(true);
  });
  function refreshGeometry() {
    if (!drag?.visual) return;
    drag.dirty = true;
    scheduleFrame(drag);
  }
  window.addEventListener('scroll', refreshGeometry, { capture: true, passive: true });
  window.addEventListener('resize', () => {
    if (!drag?.visual) return;
    drag.bar ||= destinations(drag.source);
    markTargets(drag);
  }, { passive: true });
  for (const name of ['pointercancel', 'lostpointercapture']) {
    document.addEventListener(name, event => {
      if (drag?.pointerId === event.pointerId &&
        (name !== 'lostpointercapture' || event.target === document.body)) finish();
    });
  }
  document.addEventListener('click', event => {
    if (event.detail && performance.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  document.addEventListener('contextmenu', event => {
    if (drag?.visual || drag?.pointerType === 'touch' || performance.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  document.addEventListener('dragstart', event => {
    if (event.target.closest(tileSelector)) event.preventDefault();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !drag) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    finish();
  }, true);
  window.addEventListener('blur', () => finish());
  return () => finish();
}
