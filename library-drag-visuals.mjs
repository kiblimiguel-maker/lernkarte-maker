const fallbackEasing = 'cubic-bezier(.2,.8,.3,1)';
let cancelLanding;

function firstRowAt(tiles, top) {
  let start = 0;
  let end = tiles.length;
  while (start < end) {
    const middle = (start + end) >>> 1;
    if (tiles[middle].offsetTop < top) start = middle + 1;
    else end = middle;
  }
  return start;
}

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

  // Release press styling before measuring so the ghost retains tile geometry.
  document.body.classList.add('is-organising');
  const rect = source.getBoundingClientRect();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionStyle = getComputedStyle(source);
  const easing = motionStyle.getPropertyValue('--motion-ease-out').trim() || fallbackEasing;
  const duration = (name, fallback) => {
    const value = motionStyle.getPropertyValue(name).trim();
    const match = /^(\d+(?:\.\d+)?|\.\d+)(ms|s)$/.exec(value);
    return match ? Number(match[1]) * (match[2] === 's' ? 1000 : 1) : fallback;
  };
  const moveDuration = duration('--motion-reorder', 160);
  const pickupDuration = duration('--motion-pickup', 110);
  const dismissDuration = duration('--motion-dismiss', 110);
  const offsetX = x - rect.left;
  const offsetY = y - rect.top;
  const ghost = makeGhost(source, rect);
  const cover = ghost.firstElementChild;
  cover.style.transformOrigin = `${offsetX}px ${offsetY}px`;
  const slot = document.createElement('div');
  slot.className = 'library-drag-slot';
  slot.setAttribute('aria-hidden', 'true');
  slot.style.minHeight = rect.height + 'px';

  const status = document.createElement('div');
  status.className = 'library-drag-status';
  status.setAttribute('role', 'status');
  document.body.append(ghost, status);

  const motions = new Map();
  const gridTiles = new WeakMap();
  let markedTargets = [];
  let highlightedTarget;
  let pickup;
  let landing;
  let coverLanding;
  let landingDestination;
  let finished = false;
  let cleaned = false;
  let lastX;
  let lastY;

  function cancelGridMotions() {
    for (const motion of motions.values()) motion.cancel();
    motions.clear();
  }

  function clean() {
    if (cleaned) return;
    cleaned = true;
    reducedMotion.removeEventListener('change', onMotionPreferenceChange);
    cancelGridMotions();
    pickup?.cancel();
    landing?.cancel();
    coverLanding?.cancel();
    ghost.remove();
    landingDestination?.classList.remove('library-drag-arrival');
    if (cancelLanding === clean) cancelLanding = undefined;
  }

  function onMotionPreferenceChange() {
    if (!reducedMotion.matches) return;
    cancelGridMotions();
    pickup?.cancel();
    if (finished) clean();
  }
  reducedMotion.addEventListener('change', onMotionPreferenceChange);

  function move(pointerX, pointerY) {
    if (lastX === pointerX && lastY === pointerY) return;
    lastX = pointerX;
    lastY = pointerY;
    const left = pointerX - offsetX;
    const top = pointerY - offsetY;
    ghost.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }

  function nearbyTiles(group, viewTop, viewBottom) {
    let tiles = gridTiles.get(group);
    if (!tiles) {
      // Only the placeholder changes order. Navigation replaces the grid.
      tiles = Array.from(group.children).filter(tile => tile !== source && tile.hasAttribute('data-sort-id'));
      gridTiles.set(group, tiles);
    }
    if (tiles.length < 48 || tiles[0].offsetParent !== group ||
      !group.matches('.subject-grid, .set-grid, .folder-grid')) return tiles;

    // Auto-placed grid rows follow DOM order. Layout offsets ignore running
    // transforms, so only the visible rows need visual bounding boxes.
    const groupTop = group.getBoundingClientRect().top + group.clientTop;
    let start = firstRowAt(tiles, viewTop - groupTop);
    const end = firstRowAt(tiles, viewBottom - groupTop);
    if (start > 0) {
      // A row may start above the viewport and still cross its upper edge.
      const previousTop = tiles[--start].offsetTop;
      while (start > 0 && tiles[start - 1].offsetTop === previousTop) start--;
    }
    return tiles.slice(start, end);
  }

  // Measure the currently visible positions, including an interrupted animation.
  // Cancelling before the second measurement gives the untransformed layout.
  function changeLayout(destination, change, animate = true) {
    const groups = new Set([slot.parentElement, source.parentElement, destination]);
    const before = new Map();
    if (animate && !reducedMotion.matches) {
      const margin = Math.max(rect.height, 120);
      const viewportBottom = window.innerHeight + margin;
      function measure(tile) {
        const bounds = tile.getBoundingClientRect();
        if (bounds.bottom > -margin && bounds.top < viewportBottom) before.set(tile, bounds);
      }
      for (const group of groups) {
        if (!group?.isConnected) continue;
        for (const tile of nearbyTiles(group, -margin, viewportBottom)) measure(tile);
      }
      // A previous transform may have moved a tile across the sampled rows.
      for (const tile of motions.keys()) {
        if (!before.has(tile) && tile.isConnected) measure(tile);
      }
    }
    cancelGridMotions();
    change();
    const after = Array.from(before, ([tile, oldRect]) => [tile, oldRect, tile.getBoundingClientRect()]);
    for (const [tile, oldRect, newRect] of after) {
      const dx = oldRect.left - newRect.left;
      const dy = oldRect.top - newRect.top;
      if (!tile.animate || Math.abs(dx) + Math.abs(dy) < 1) continue;
      const motion = tile.animate([
        { transform: `translate(${dx}px, ${dy}px)` },
        { transform: 'translate(0, 0)' },
      ], { duration: moveDuration, easing });
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
    const needsMotion = Boolean(slot.parentElement || target);
    changeLayout(parent, () => {
      source.classList.add('library-drag-source');
      parent.insertBefore(slot, anchor);
    }, needsMotion);
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

  function restore(animate = true) {
    changeLayout(source.parentElement, () => {
      slot.remove();
      source.classList.remove('library-drag-source');
    }, animate && slot.isConnected);
    highlight(null);
    markTargets([]);
  }

  function layoutSettled() {
    if (motions.size) return Promise.allSettled(Array.from(motions.values(), motion => motion.finished));
  }

  function finish(destination = source) {
    if (finished) return;
    finished = true;
    landingDestination = destination;
    restore();
    status.remove();

    const goal = destination?.isConnected ? destination.getBoundingClientRect() : null;
    document.body.classList.remove('is-organising');
    const visible = goal?.width && goal.height && goal.bottom > 0 && goal.top < window.innerHeight &&
      goal.right > 0 && goal.left < window.innerWidth;
    if (!ghost.animate || reducedMotion.matches) {
      clean();
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
    landing = ghost.animate([
      { transform: ghost.style.transform, opacity: 1 },
      { transform, opacity: returningToTile ? 1 : 0 },
    ], { duration: visible ? moveDuration : dismissDuration, easing, fill: 'forwards' });
    if (visible && pickup) {
      const transform = getComputedStyle(cover).transform;
      pickup.cancel();
      coverLanding = cover.animate([{ transform }, { transform: 'none' }], { duration: moveDuration, easing, fill: 'forwards' });
    }
    cancelLanding = clean;
    landing.finished.then(clean, clean);
  }

  move(x, y);
  preview(null);
  if (!reducedMotion.matches) {
    pickup = cover.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.018)' }], {
      duration: pickupDuration, easing, fill: 'forwards',
    });
  }
  return { move, preview, markTargets, highlight, restore, layoutSettled, finish };
}
