const easing = 'cubic-bezier(.2,.8,.3,1)';
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let cancelLanding;

function makeGhost(source, rect) {
  const copy = source.cloneNode(true);
  for (const element of [copy, ...copy.querySelectorAll('*')]) {
    for (const attribute of element.getAttributeNames()) {
      if (attribute === 'id' || attribute.startsWith('data-')) element.removeAttribute(attribute);
    }
  }
  copy.classList.remove('drop-allowed', 'drop-over', 'drop-rejected');
  copy.querySelectorAll('details[open]').forEach(menu => menu.removeAttribute('open'));

  const ghost = document.createElement('div');
  ghost.className = 'library-drag-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  ghost.style.width = rect.width + 'px';
  ghost.style.height = rect.height + 'px';
  ghost.append(copy);
  return ghost;
}

export function createLibraryDragVisuals(source, { x, y }) {
  cancelLanding?.();

  const rect = source.getBoundingClientRect();
  const offsetX = x - rect.left;
  const offsetY = y - rect.top;
  const ghost = makeGhost(source, rect);
  const slot = document.createElement('div');
  slot.className = 'library-drag-slot';
  slot.setAttribute('aria-hidden', 'true');
  slot.style.minHeight = rect.height + 'px';

  const status = document.createElement('div');
  status.className = 'library-drag-status';
  status.setAttribute('role', 'status');
  document.body.append(ghost, status);
  document.body.classList.add('is-organising');

  const motions = new Map();
  let markedTargets = [];
  let highlightedTarget;

  function move(pointerX, pointerY) {
    const left = pointerX - offsetX;
    const top = pointerY - offsetY;
    ghost.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }

  // Measure the currently visible positions, including an interrupted animation.
  // Cancelling before the second measurement gives the untransformed layout.
  function changeLayout(destination, change) {
    const groups = new Set([slot.parentElement, source.parentElement, destination]);
    const neighbours = [...groups].filter(Boolean).flatMap(group => [...group.children])
      .filter(tile => tile !== source && tile.hasAttribute('data-sort-id'));
    const before = reduceMotion() ? [] : neighbours.map(tile => [tile, tile.getBoundingClientRect()]);
    for (const tile of neighbours) {
      motions.get(tile)?.cancel();
      motions.delete(tile);
    }
    change();
    const after = before.map(([tile, oldRect]) => [tile, oldRect, tile.getBoundingClientRect()]);
    for (const [tile, oldRect, newRect] of after) {
      const dx = oldRect.left - newRect.left;
      const dy = oldRect.top - newRect.top;
      if (!tile.animate || Math.abs(dx) + Math.abs(dy) < 1) continue;
      const motion = tile.animate([
        { transform: `translate(${dx}px, ${dy}px)` },
        { transform: 'translate(0, 0)' },
      ], { duration: 185, easing });
      motions.set(tile, motion);
      const clear = () => { if (motions.get(tile) === motion) motions.delete(tile); };
      motion.finished.then(clear, clear);
    }
  }

  function preview(target, placement) {
    if (target === source || target === slot) return;
    const anchor = target
      ? placement === 'after' ? target.nextElementSibling : target
      : source;
    const parent = target?.parentElement || source.parentElement;
    if (!parent?.isConnected) {
      if (!target && slot.isConnected) changeLayout(null, () => slot.remove());
      return;
    }
    if (anchor === slot ||
      (slot.parentElement === parent && slot.nextElementSibling === anchor)) return;
    changeLayout(parent, () => {
      source.classList.add('library-drag-source');
      parent.insertBefore(slot, anchor);
    });
  }

  function markTargets(elements) {
    for (const target of markedTargets) target.classList.remove('drop-allowed');
    markedTargets = [...elements];
    for (const target of markedTargets) target.classList.add('drop-allowed');
  }

  function highlight(target, label = '') {
    if (highlightedTarget !== target) {
      highlightedTarget?.classList.remove('drop-over');
      target?.classList.add('drop-over');
      highlightedTarget = target;
    }
    if (status.textContent !== label) status.textContent = label;
  }

  function restore() {
    changeLayout(source.parentElement, () => {
      slot.remove();
      source.classList.remove('library-drag-source');
    });
    highlight(null);
    markTargets([]);
  }

  function finish(destination = source) {
    restore();
    document.body.classList.remove('is-organising');
    status.remove();

    const goal = destination?.isConnected ? destination.getBoundingClientRect() : null;
    const visible = goal?.width && goal.height && goal.bottom > 0 && goal.top < window.innerHeight &&
      goal.right > 0 && goal.left < window.innerWidth;
    if (!ghost.animate || reduceMotion()) {
      ghost.remove();
      return;
    }

    const returningToTile = visible && destination.dataset.sortId === source.dataset.sortId &&
      destination.dataset.sortType === source.dataset.sortType;
    if (returningToTile) destination.classList.add('library-drag-arrival');
    let transform = ghost.style.transform;
    if (returningToTile) {
      transform = `translate3d(${goal.left}px, ${goal.top}px, 0) scale(${goal.width / rect.width}, ${goal.height / rect.height})`;
    } else if (visible) {
      const scale = .84;
      const left = goal.left + (goal.width - rect.width * scale) / 2;
      const top = goal.top + (goal.height - rect.height * scale) / 2;
      transform = `translate3d(${left}px, ${top}px, 0) scale(${scale})`;
    }
    const landing = ghost.animate([
      { transform: ghost.style.transform, opacity: 1 },
      { transform, opacity: returningToTile ? 1 : 0 },
    ], { duration: visible ? 185 : 120, easing, fill: 'forwards' });
    if (visible) {
      ghost.firstElementChild.animate([
        { transform: getComputedStyle(ghost.firstElementChild).transform },
        { transform: 'none', boxShadow: 'none' },
      ], { duration: 185, easing, fill: 'forwards' });
    }
    const clean = () => {
      ghost.remove();
      destination?.classList.remove('library-drag-arrival');
      if (cancelLanding === clean) cancelLanding = undefined;
    };
    cancelLanding = clean;
    landing.finished.then(clean, clean);
  }

  move(x, y);
  preview(null);
  if (!reduceMotion()) {
    ghost.firstElementChild.animate?.([
      { transform: 'scale(1)', boxShadow: 'none' },
      { transform: 'scale(1.025)', boxShadow: 'var(--shadow)' },
    ], { duration: 145, easing, fill: 'forwards' });
  }
  return { move, preview, markTargets, highlight, restore, finish };
}
