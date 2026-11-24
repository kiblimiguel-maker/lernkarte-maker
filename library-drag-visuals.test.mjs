import assert from 'node:assert/strict';
import { createLibraryDragVisuals } from './library-drag-visuals.mjs';

const preferenceListeners = new Set();
const animations = [];
let measuringPickup = false;
const motionPreference = {
  matches: false,
  addEventListener(type, listener) { preferenceListeners.add(listener); },
  removeEventListener(type, listener) { preferenceListeners.delete(listener); }
};

class TestElement {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.style = {};
    const classes = new Set();
    this.classList = {
      add(...names) { names.forEach(name => classes.add(name)); },
      remove(...names) { names.forEach(name => classes.delete(name)); },
      contains(name) { return classes.has(name); }
    };
  }
  get isConnected() { return this === body || Boolean(this.parentElement?.isConnected); }
  get firstElementChild() { return this.children[0]; }
  get nextElementSibling() {
    const siblings = this.parentElement?.children || [];
    return siblings[siblings.indexOf(this) + 1] || null;
  }
  getBoundingClientRect() {
    // A pressed source must be measured only after drag styling takes over.
    if (this === source && measuringPickup) assert.equal(body.classList.contains('is-organising'), true);
    return { left: 10, top: 10, width: 180, height: 100, right: 190, bottom: 110 };
  }
  append(...children) { children.forEach(child => this.insertBefore(child, null)); }
  insertBefore(child, anchor) {
    child.remove();
    const index = anchor ? this.children.indexOf(anchor) : this.children.length;
    this.children.splice(index, 0, child);
    child.parentElement = this;
  }
  remove() {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentElement = null;
  }
  cloneNode() { return new TestElement(); }
  querySelectorAll() { return []; }
  getAttributeNames() { return []; }
  setAttribute() {}
  removeAttribute() {}
  hasAttribute() { return false; }
  animate(keyframes, options) {
    let resolve;
    const animation = {
      canceled: false,
      options,
      finished: new Promise(done => { resolve = done; }),
      cancel() { this.canceled = true; resolve(); }
    };
    animations.push(animation);
    return animation;
  }
}

const body = new TestElement();
const source = new TestElement();
source.dataset = { sortType: 'set', sortId: 'original' };
body.append(source);
globalThis.document = { body, createElement: () => new TestElement() };
globalThis.window = { innerWidth: 900, innerHeight: 700, matchMedia: () => motionPreference };
let tokens = {};
globalThis.getComputedStyle = () => ({ getPropertyValue: name => tokens[name] || 'ease-out', transform: 'scale(1.018)' });

function setReducedMotion(value) {
  motionPreference.matches = value;
  for (const listener of [...preferenceListeners]) listener();
}

function pickup() {
  measuringPickup = true;
  const visual = createLibraryDragVisuals(source, { x: 30, y: 30 });
  measuringPickup = false;
  return visual;
}

let visual = pickup();
const activeGhost = body.children.find(child => child.className === 'library-drag-ghost');
assert.equal(preferenceListeners.size, 1);
assert.equal(animations.length, 1, 'pickup starts one visual effect');
assert.equal(animations[0].options.duration, 110, 'missing or invalid duration tokens use the pickup fallback');
setReducedMotion(true);
assert.equal(animations[0].canceled, true, 'changing the system preference cancels current pickup');
assert.equal(activeGhost.isConnected, true, 'the held tile remains directly draggable');
visual.move(120, 160);
assert.equal(activeGhost.style.transform, 'translate3d(100px, 140px, 0)');
visual.finish(source);
assert.equal(activeGhost.isConnected, false, 'reduced-motion release requires no landing frame');
assert.equal(preferenceListeners.size, 0);

setReducedMotion(false);
visual = pickup();
visual.finish(source);
assert.equal(source.classList.contains('library-drag-arrival'), true);
setReducedMotion(true);
assert.equal(source.classList.contains('library-drag-arrival'), false, 'the real tile becomes visible immediately');
assert.equal(body.children.some(child => child.className === 'library-drag-ghost'), false);
assert.equal(animations.slice(-3).every(animation => animation.canceled), true, 'landing and pickup animations are released');
assert.equal(preferenceListeners.size, 0);

setReducedMotion(false);
visual = pickup();
visual.finish(source);
const previousGhost = body.children.find(child => child.className === 'library-drag-ghost');
const nextVisual = pickup();
assert.equal(previousGhost.isConnected, false, 'a new drag cancels a previous landing');
assert.equal(source.classList.contains('library-drag-arrival'), false);
assert.equal(preferenceListeners.size, 1, 'previous landing listener is removed before the next pickup');
setReducedMotion(true);
nextVisual.finish(null);
nextVisual.finish(null);
await Promise.resolve();
assert.equal(preferenceListeners.size, 0, 'duplicate finish is harmless and releases all listeners');
assert.deepEqual(body.children, [source]);

for (const [value, expected] of [['.12s', 120], ['125ms', 125], ['0ms', 0], ['160garbage', 110], ['-1ms', 110], ['160', 110]]) {
  setReducedMotion(false);
  tokens = { '--motion-pickup': value };
  const current = pickup();
  assert.equal(animations.at(-1).options.duration, expected, `duration token ${value}`);
  setReducedMotion(true);
  current.finish(null);
}
assert.equal(preferenceListeners.size, 0);

console.log('Drag visual checks passed: pressed-source geometry, live reduced motion, landing cancellation and cleanup.');
