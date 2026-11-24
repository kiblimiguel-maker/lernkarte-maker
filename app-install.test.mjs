import assert from 'node:assert/strict';
import { bindAppInstall } from './app-install.mjs';

class Element extends EventTarget {
  hidden = false;
  disabled = false;
  textContent = '';
  attributes = new Map();
  setAttribute(name, value) { this.attributes.set(name, value); }
}

function fixture({ standalone = false, iosStandalone = false } = {}) {
  const controls = Object.fromEntries(['button', 'description', 'help', 'status'].map(key => [`#app-install-${key}`, new Element()]));
  const section = { querySelector: selector => controls[selector] };
  const doc = { querySelector: selector => selector === '#app-install' ? section : null };
  const mode = new EventTarget();
  mode.matches = standalone;
  const win = new EventTarget();
  win.navigator = { standalone: iosStandalone };
  win.matchMedia = () => mode;
  const dispose = bindAppInstall({ win, doc });
  const offer = prompt => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    event.prompt = prompt;
    win.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    return event;
  };
  return { win, mode, dispose, offer, ...Object.fromEntries(Object.entries(controls).map(([id, value]) => [id.replace('#app-install-', ''), value])) };
}

const tick = () => new Promise(resolve => setImmediate(resolve));
const click = button => button.dispatchEvent(new Event('click'));

const page = fixture();
assert.equal(page.button.hidden, true, 'manual instructions are available without claiming native installation support');
assert.equal(page.help.hidden, false);
let promptCalls = 0;
let choose;
page.offer(() => { promptCalls++; return new Promise(resolve => { choose = resolve; }); });
assert.equal(page.button.hidden, false);
click(page.button);
click(page.button);
assert.equal(promptCalls, 1, 'double clicking cannot consume the one-use install event twice');
assert.equal(page.button.disabled, true);
choose({ outcome: 'dismissed' });
await tick();
assert.equal(page.button.hidden, true);
assert.equal(page.help.hidden, false);
assert.match(page.status.textContent, /später/);
click(page.button);
assert.equal(promptCalls, 1);

page.offer(async () => { throw new Error('Native installation is temporarily unavailable'); });
click(page.button);
await tick();
assert.equal(page.button.hidden, true);
assert.equal(page.help.open, true);
assert.match(page.status.textContent, /nicht geöffnet/);

const legacyPrompt = page.offer(async () => undefined);
legacyPrompt.userChoice = Promise.resolve({ outcome: 'accepted' });
click(page.button);
await tick();
assert.match(page.status.textContent, /übernimmt/);
page.win.dispatchEvent(new Event('appinstalled'));
assert.equal(page.button.hidden, true);
assert.equal(page.help.hidden, true);
assert.match(page.status.textContent, /erfolgreich/);
page.dispose();

for (const setup of [{ standalone: true }, { iosStandalone: true }]) {
  const installed = fixture(setup);
  installed.offer(async () => ({ outcome: 'accepted' }));
  assert.equal(installed.button.hidden, true);
  assert.equal(installed.help.hidden, true);
  assert.match(installed.description.textContent, /bereits/);
  installed.dispose();
}

const changedMode = fixture();
changedMode.mode.matches = true;
changedMode.mode.dispatchEvent(new Event('change'));
assert.equal(changedMode.help.hidden, true);
changedMode.mode.matches = false;
changedMode.mode.dispatchEvent(new Event('change'));
assert.equal(changedMode.help.hidden, false);
changedMode.dispose();

console.log('App installation checks passed: capability-based offer, one-use prompt, dismissal, accepted result, retry, installed modes and display changes.');
