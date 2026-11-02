(() => {
  'use strict';

  const wordCharacter = /[\p{L}\p{N}_]/u;

  // Return text segments for display only. The source card value is never changed.
  function genderSegments(value) {
    const text = String(value ?? '');
    const segments = [];
    const marker = /\(\s*([mf])\s*\)|une|un/giu;
    let cursor = 0;
    let match;

    while ((match = marker.exec(text))) {
      const isMarker = match[1] !== undefined;
      const before = Array.from(text.slice(0, match.index)).at(-1) || '';
      const after = Array.from(text.slice(marker.lastIndex))[0] || '';
      if (!isMarker && (wordCharacter.test(before) || wordCharacter.test(after))) continue;

      if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index), gender: null });
      const token = match[0];
      const gender = isMarker ? match[1].toLowerCase() : token.toLowerCase() === 'un' ? 'm' : 'f';
      segments.push({ text: token, gender });
      cursor = marker.lastIndex;
    }

    if (cursor < text.length || !segments.length) segments.push({ text: text.slice(cursor), gender: null });
    return segments;
  }

  const api = { genderSegments };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.WortwerkPresentation = api;
})();
