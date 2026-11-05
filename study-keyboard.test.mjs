import assert from 'node:assert/strict';
import { studyKeyboardAction } from './study-keyboard.mjs';

const active = { open: true, canInteract: true };
const event = (key, extra = {}) => ({ key, target: { closest: () => null }, ...extra });
const action = (key, extra = {}, state = active) => studyKeyboardAction(event(key, extra), state);

for (const key of ['n', 'N']) assert.equal(action(key), 'missed');
for (const key of ['m', 'M']) assert.equal(action(key), 'known');
assert.equal(action(' '), 'flip');
assert.equal(action('ArrowLeft'), 'previous');
assert.equal(action('ArrowRight'), 'next');
assert.equal(action('Escape'), 'close');

for (const key of ['n', 'm', ' ', 'ArrowLeft', 'ArrowRight']) {
  assert.equal(action(key, {}, { open: false, canInteract: true }), null);
  assert.equal(action(key, {}, { open: true, canInteract: false }), null);
  assert.equal(action(key, {}, { ...active, blocked: true }), null);
  for (const flag of ['repeat', 'defaultPrevented', 'isComposing', 'ctrlKey', 'metaKey', 'altKey']) {
    assert.equal(action(key, { [flag]: true }), null, `${key} must ignore ${flag}`);
  }
  assert.equal(action(key, { keyCode: 229 }), null);
}

// A nested dialog owns Escape; ending study must not close the session behind it.
assert.equal(action('Escape', {}, { ...active, blocked: true }), null);
assert.equal(action('Escape', {}, { open: true, canInteract: false }), 'close');
for (const editingTarget of [
  { isContentEditable: true, closest: () => null },
  { closest: selector => selector.includes('input') ? {} : null }
]) {
  for (const key of ['n', 'M', ' ', 'ArrowLeft', 'Escape']) assert.equal(action(key, { target: editingTarget }), null);
}

for (const button of ['study-close', 'answer-no', 'answer-yes', 'study-card-0']) {
  const focusedButton = { id: button, closest: selector => selector === 'button' ? {} : null };
  assert.equal(action('n', { target: focusedButton }), 'missed');
  assert.equal(action('M', { target: focusedButton }), 'known');
  assert.equal(action(' ', { target: focusedButton }), 'flip');
  assert.equal(action('ArrowRight', { target: focusedButton }), 'next');
  assert.equal(action('ArrowLeft', { target: focusedButton }), 'previous');
}

// State is read for each event: a rating locks the current card until the next
// card is ready, and holding a key never rates the newly revealed card.
let state = { ...active }, ratings = [];
const dispatch = input => {
  const next = studyKeyboardAction(input, state);
  if (next === 'known' || next === 'missed') { ratings.push(next); state.canInteract = false; }
};
dispatch(event('m'));
dispatch(event('n'));
state.canInteract = true;
dispatch(event('m', { repeat: true }));
dispatch(event('n'));
assert.deepEqual(ratings, ['known', 'missed']);
assert.equal(action('x'), null);
console.log('Study keyboard checks passed: ratings, navigation, focus, modifiers, repeats, dialogs and composition.');
