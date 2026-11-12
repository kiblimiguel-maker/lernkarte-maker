const htmlEntities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeText = value => String(value ?? '').replace(/[&<>"']/g, character => htmlEntities[character]);

function conjugationCell({ pronoun, form, separator }) {
  return `<span role="cell">${escapeText(pronoun)}${escapeText(separator ?? ' ')}<strong>${escapeText(form)}</strong></span>`;
}

export function frenchVerbCardMarkup(verb, german) {
  const singular = verb.forms.slice(0, 3);
  const plural = verb.forms.slice(3);

  return `<span class="french-verb-card" role="table" aria-label="Französische Verbformen">
    <span class="french-verb-row french-verb-heading" role="row">
      <span role="cell" lang="de"><strong>${escapeText(german)}</strong></span>
      <span role="cell" lang="fr"><strong>${escapeText(verb.infinitive)}</strong></span>
    </span>
    <span class="french-verb-row french-verb-meta" role="row" lang="fr">
      <span role="cell">${escapeText(verb.stem || '—')}</span>
      <span class="french-verb-past" role="cell"><strong>${escapeText(verb.auxiliary)}</strong><span>${escapeText(verb.participle)}</span></span>
    </span>
    ${singular.map((form, index) => `<span class="french-verb-row french-verb-conjugation" role="row" lang="fr">${conjugationCell(form)}${conjugationCell(plural[index])}</span>`).join('')}
  </span>`;
}
