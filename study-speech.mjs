// Prepare the spoken text without modifying the stored or displayed card content.
export function speechText(text) {
  return String(text ?? '')
    .replace(/\(\s*[mf](?:\s+pl)?\s*\)/giu, ' ')
    .replace(/\s+\/\s+|(?<=[\p{L}\p{M}])\s*\/\s*(?=\p{L})/gu, ', ')
    .replace(/\s+(?=[,.])/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

// Older decks have no language setting. Use their subject/title as a hint
// and prefer the explicit language of a structured verb card.
export function frenchSpeechSide(preference, { frontVerb, backVerb, subjectName, subjectSymbol, deckName } = {}) {
  if (preference === 'off') return null;
  if (preference === 'front' || preference === 'back') return preference;
  if (backVerb) return 'back';
  if (frontVerb) return 'front';
  const frenchName = /(?:^|[^\p{L}])(?:französisch(?:e[rnms]?)?|franz|français|french)(?![\p{L}])/iu;
  return subjectSymbol?.includes('🇫🇷') || frenchName.test(subjectName ?? '') || frenchName.test(deckName ?? '') ? 'back' : null;
}

export function frenchSpeechForms(verb) {
  return verb?.forms.flatMap(({ pronoun, separator, form }) => {
    if (!form) return [];
    const parts = pronoun.split('/').map(part => part.trim());
    return [{
      label: pronoun + separator + form,
      speech: parts.map(part => part + separator + form).join(', '),
    }];
  }) || [];
}

function frenchVoice(voices) {
  const local = voices.filter(voice => voice.localService === true && /^fr(?:[-_]|$)/i.test(voice.lang));
  const preferredLanguages = ['fr-fr', 'fr-ch', 'fr-be', 'fr-ca'];
  for (const language of preferredLanguages) {
    const candidates = local.filter(voice => voice.lang.toLowerCase().replace('_', '-') === language);
    if (candidates.length) {
      // Chromium on macOS can list novelty voices before the standard voices.
      return candidates.find(voice => voice.default)
        ?? candidates.find(voice => /^(thomas|jacques)$/iu.test(voice.name))
        ?? candidates[0];
    }
  }
  return local.find(voice => voice.default) ?? local[0];
}

export function createStudySpeech({
  synthesis = globalThis.speechSynthesis,
  Utterance = globalThis.SpeechSynthesisUtterance,
  onState = () => {},
} = {}) {
  const supported = typeof Utterance === 'function' && ['getVoices', 'speak', 'cancel']
    .every(method => typeof synthesis?.[method] === 'function');
  let active = null;

  // Some engines populate the list asynchronously after the first request.
  if (supported) {
    try { synthesis.getVoices(); } catch { /* Try again when the user presses Play. */ }
  }

  const update = (status, key = null) => onState({ status, key });

  function cancelActive() {
    if (!active) return;
    // Invalidate first. cancel() can deliver the old utterance's error immediately.
    active = null;
    try { synthesis.cancel(); } catch { /* The UI can still reset safely. */ }
  }

  function stop() {
    cancelActive();
    update('idle');
  }

  function play(key, value) {
    if (active?.key === key) {
      stop();
      return;
    }

    cancelActive();
    const text = speechText(value);
    if (!text) {
      update('idle');
      return;
    }
    if (!supported) {
      update('unsupported', key);
      return;
    }

    try {
      const voice = frenchVoice(synthesis.getVoices());
      if (!voice) {
        update('no-voice', key);
        return;
      }

      const utterance = new Utterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang.replace('_', '-');
      const request = { key, utterance };
      active = request;
      const finish = status => {
        if (active !== request) return;
        active = null;
        update(status, status === 'idle' ? null : key);
      };
      utterance.onend = () => finish('idle');
      utterance.onerror = event => finish(['canceled', 'interrupted'].includes(event.error) ? 'idle' : 'error');
      update('playing', key);
      synthesis.speak(utterance);
    } catch {
      cancelActive();
      update('error', key);
    }
  }

  return { supported, play, stop };
}
