import assert from 'node:assert/strict';
import { createStudySpeech, frenchSpeechForms, frenchSpeechSide, speechText } from './study-speech.mjs';

assert.equal(speechText('un employé (m) / une employée (f)'), 'un employé, une employée');
assert.equal(speechText('Je retrouve les amies ( F PL ) et les garçons (m pl).'), 'Je retrouve les amies et les garçons.');
assert.equal(speechText('détail (important) : 3/4'), 'détail (important) : 3/4');
assert.equal(speechText('courir /partir'), 'courir, partir');
assert.equal(speechText('un employé(m)/une employée(f)'), 'un employé, une employée');
assert.equal(speechText('(m)'), '');

assert.equal(frenchSpeechSide('auto', { subjectName: 'Französisch' }), 'back');
assert.equal(frenchSpeechSide(undefined, { subjectSymbol: '🇫🇷' }), 'back');
assert.equal(frenchSpeechSide(undefined, { deckName: 'Verben · Français' }), 'back');
assert.equal(frenchSpeechSide(undefined, { subjectName: 'Englisch', deckName: 'Vokabeln' }), null);
assert.equal(frenchSpeechSide(undefined, { subjectName: 'Französischer Unterricht', frontVerb: {} }), 'front');
assert.equal(frenchSpeechSide(undefined, { backVerb: {} }), 'back');
assert.equal(frenchSpeechSide('front', { subjectName: 'Allgemein' }), 'front');
assert.equal(frenchSpeechSide('off', { backVerb: {}, subjectName: 'Französisch' }), null);
assert.deepEqual(frenchSpeechForms({
  forms: [
    { pronoun: 'j’', separator: '', form: 'aime' },
    { pronoun: 'il / elle / on', separator: ' ', form: 'va' },
    { pronoun: 'nous', separator: ' ', form: 'allons' },
    { pronoun: '', separator: '', form: '' },
  ],
}), [
  { label: 'j’aime', speech: 'j’aime' },
  { label: 'il / elle / on va', speech: 'il va, elle va, on va' },
  { label: 'nous allons', speech: 'nous allons' },
]);

const remoteFrench = { lang: 'fr-FR', localService: false, default: true };
const english = { lang: 'en-US', localService: true, default: true };
const swissFrench = { lang: 'fr-CH', localService: true };
const franceFrench = { lang: 'fr-FR', localService: true };
const frenchDefault = { lang: 'fr-FR', localService: true, default: true };
const standardFrench = { name: 'Thomas', lang: 'fr-FR', localService: true };
const spoken = [];
const states = [];
let voices = [];
let cancels = 0;

const synthesis = {
  getVoices: () => voices,
  speak: utterance => spoken.push(utterance),
  cancel() {
    cancels += 1;
    spoken.at(-1)?.onerror({ error: 'canceled' });
  },
};
class Utterance {
  constructor(text) { this.text = text; }
}
const reader = createStudySpeech({ synthesis, Utterance, onState: state => states.push(state) });
const lastState = () => states.at(-1);

assert.equal(reader.supported, true);
reader.play('term', 'courir');
assert.deepEqual(lastState(), { status: 'no-voice', key: 'term' });
voices = [remoteFrench, english];
reader.play('term', 'courir');
assert.deepEqual(lastState(), { status: 'no-voice', key: 'term' });
assert.equal(spoken.length, 0);

voices = [remoteFrench, english, swissFrench, franceFrench, frenchDefault];
reader.play('term', 'courir (m)');
assert.equal(spoken[0].voice, frenchDefault);
assert.equal(spoken[0].lang, 'fr-FR');
assert.equal(spoken[0].text, 'courir');
assert.deepEqual(lastState(), { status: 'playing', key: 'term' });

reader.play('example', 'Nous courons.');
assert.equal(cancels, 1);
assert.deepEqual(lastState(), { status: 'playing', key: 'example' });
spoken[0].onend();
assert.deepEqual(lastState(), { status: 'playing', key: 'example' });
reader.play('example', 'Nous courons.');
assert.equal(cancels, 2);
assert.equal(spoken.length, 2);
assert.deepEqual(lastState(), { status: 'idle', key: null });

voices = [remoteFrench, english, swissFrench];
reader.play('form', 'nous courons');
assert.equal(spoken[2].voice, swissFrench);
spoken[2].onerror({ error: 'synthesis-failed' });
assert.deepEqual(lastState(), { status: 'error', key: 'form' });
reader.play('form', 'nous courons');
spoken[3].onend();
assert.deepEqual(lastState(), { status: 'idle', key: null });

reader.play('term', 'courir');
reader.stop();
assert.equal(cancels, 3);
assert.deepEqual(lastState(), { status: 'idle', key: null });
spoken[4].onend();
assert.deepEqual(lastState(), { status: 'idle', key: null });

synthesis.speak = () => { throw new Error('output unavailable'); };
reader.play('term', 'courir');
assert.deepEqual(lastState(), { status: 'error', key: 'term' });

voices = [franceFrench, standardFrench];
synthesis.speak = utterance => spoken.push(utterance);
reader.play('term', 'courir');
assert.equal(spoken.at(-1).voice, standardFrench);
reader.stop();

const unavailable = createStudySpeech({ synthesis: null, Utterance, onState: state => states.push(state) });
assert.equal(unavailable.supported, false);
unavailable.play('term', 'courir');
assert.deepEqual(lastState(), { status: 'unsupported', key: 'term' });
console.log('Study speech checks passed: local French voices, text preparation, toggles, stale events and errors.');
