(() => {
  'use strict';

  const wordCharacter = /[\p{L}\p{N}_]/u;

  function codePointBefore(text, index) {
    if (index <= 0) return '';
    let start = index - 1;
    const unit = text.charCodeAt(start);
    if (unit >= 0xdc00 && unit <= 0xdfff && start > 0) start -= 1;
    return text.slice(start, index);
  }

  function codePointAfter(text, index) {
    return index < text.length ? String.fromCodePoint(text.codePointAt(index)) : '';
  }

  // Return text segments for display only. The source card value is never changed.
  function genderSegments(value) {
    const text = String(value ?? '');
    const segments = [];
    const marker = /\(\s*([mf])(?:\s+pl)?\s*\)|une|un|le|la/giu;
    let cursor = 0;
    let match;

    while ((match = marker.exec(text))) {
      const isMarker = match[1] !== undefined;
      const before = codePointBefore(text, match.index);
      const after = codePointAfter(text, marker.lastIndex);
      if (!isMarker && (wordCharacter.test(before) || wordCharacter.test(after))) continue;

      if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index), gender: null });
      const token = match[0];
      const article = token.toLowerCase();
      const gender = isMarker ? match[1].toLowerCase() : article === 'un' || article === 'le' ? 'm' : 'f';
      segments.push({ text: token, gender });
      cursor = marker.lastIndex;
    }

    if (cursor < text.length || !segments.length) segments.push({ text: text.slice(cursor), gender: null });
    return segments;
  }

  function colourInk(value) {
    const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : '#3378F6';
    const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255);
    const linear = rgb.map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
    const luminance = linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
    return (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? '#000000' : '#FFFFFF';
  }

  const api = { genderSegments, colourInk };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.WortwerkPresentation = api;
})();
