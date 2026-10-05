(() => {
  'use strict';

  function parseImport(text) {
    const rows = [];
    const errors = [];
    // Treat a leading UTF-8 BOM as an encoding marker and recognize the line
    // separators commonly found in copied text from different platforms.
    const lines = String(text ?? '').replace(/^\uFEFF/, '').split(/\r\n?|\n|\u2028|\u2029/);

    lines.forEach((raw, index) => {
      if (!raw.trim()) return;

      // Strip indentation only when it belongs to an explicit list marker.
      const marker = raw.match(/^\p{White_Space}*(?:(?:\d+[.)])|[•●▪◦‣*+\-–—☐])\p{White_Space}+/u);
      const line = marker ? raw.slice(marker[0].length) : raw;

      const equalsAt = line.indexOf('=');
      if (equalsAt < 0) {
        errors.push({ line: index + 1, text: raw, reason: "Kein '=' gefunden" });
        return;
      }

      const left = line.slice(0, equalsAt);
      const right = line.slice(equalsAt + 1);
      const front = left.trim();
      const back = right.trim();
      if (!front && !back) {
        const reason = !left && !right ? 'Vorderseite und Rückseite fehlen' : right.length ? 'Rückseite fehlt' : 'Vorderseite fehlt';
        errors.push({ line: index + 1, text: raw, reason });
      } else if (!front) {
        errors.push({ line: index + 1, text: raw, reason: 'Vorderseite fehlt' });
      } else if (!back) {
        errors.push({ line: index + 1, text: raw, reason: 'Rückseite fehlt' });
      } else {
        rows.push({ line: index + 1, front, back });
      }
    });

    return { rows, errors };
  }

  const api = { parseImport };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof globalThis !== 'undefined') globalThis.WortwerkParser = api;
})();
