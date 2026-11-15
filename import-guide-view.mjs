import { importGuideExamples, frenchImportPrompt } from './import-guide.mjs';
import { frenchVerbExample, frenchVerbPrompt, parseFrenchVerbImport } from './french-verbs.mjs';

const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeText = value => String(value).replace(/[&<>"']/g, character => entities[character]);

function previewCard(card, side, theme, cardSideMarkup) {
  const colors = theme[side];
  const style = [
    ['--guide-card-surface', colors.surface],
    ['--guide-card-text', colors.text],
    ['--guide-card-muted', colors.muted],
    ['--guide-card-border', colors.border],
    ['--gender-masculine-color', colors['gender-masculine']],
    ['--gender-feminine-color', colors['gender-feminine']],
  ].map(([name, value]) => `${name}:${value}`).join(';');
  return `<div class="guide-card guide-card-${side}" style="${style}">
    <span class="guide-card-label">${side === 'front' ? 'Vorderseite' : 'Rückseite'}</span>
    <div class="guide-card-copy">${cardSideMarkup(card, side)}</div>
  </div>`;
}

function promptPanel(format, index, theme, cardSideMarkup) {
  const { id, label, purpose, source, card, prompt } = format;
  return `
    <section class="guide-panel" id="guide-panel-${id}" role="tabpanel" aria-labelledby="guide-tab-${id}"${index ? ' hidden' : ''}>
      <div class="guide-panel-head">
        <h3>${label}</h3>
        <p>${purpose}</p>
      </div>
      <figure class="guide-result">
        <figcaption class="guide-result-caption">So sieht die fertige Karte aus</figcaption>
        <div class="guide-card-pair">
          ${previewCard(card, 'front', theme, cardSideMarkup)}
          ${previewCard(card, 'back', theme, cardSideMarkup)}
        </div>
      </figure>
      <div class="guide-prompt-box">
        <div class="guide-prompt-toolbar">
          <div>
            <label for="guide-prompt-${id}">KI-Prompt<span class="sr-only"> für ${label}</span></label>
            <p class="guide-copy-status" role="status"></p>
          </div>
          <button type="button" class="primary-button" data-guide-copy>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 4H6a2 2 0 0 0-2 2v10"/></svg>
            Prompt kopieren
          </button>
        </div>
        <textarea readonly spellcheck="false" class="guide-prompt" rows="7" id="guide-prompt-${id}">${escapeText(prompt)}</textarea>
      </div>
      <div class="guide-panel-tools">
        <details class="guide-disclosure">
          <summary>Importtext ansehen</summary>
          <pre class="guide-example" data-guide-source><code>${escapeText(source)}</code></pre>
        </details>
        <button type="button" class="quiet-button" data-guide-import="${id}">Beispiel im Import öffnen</button>
      </div>
    </section>`;
}

export function renderImportGuide({ cardSideMarkup, theme, learningGoalPrompt, learningGoalExample }) {
  const vocabulary = importGuideExamples[3];
  const [front, back] = vocabulary.split(' = ');
  const formats = [
    {
      id: 'learning-goals', label: 'Lernziele & Stichpunkte', short: 'Für Schulfächer',
      purpose: 'Aus deinen Lernzielen und Notizen entstehen Karten mit dem Lernziel vorne und kurzen Antwortpunkten hinten.',
      source: learningGoalExample.source, card: learningGoalExample, prompt: learningGoalPrompt,
    },
    {
      id: 'vocabulary', label: 'Französische Vokabeln', short: 'Wörter und Beispielsätze', compact: 'Vokabeln',
      purpose: 'Aus einer Vokabelliste entstehen Karten mit deutscher Bedeutung vorne, französischer Übersetzung hinten und einem Beispielsatz pro Seite.',
      source: vocabulary, card: { front, back }, prompt: frenchImportPrompt,
    },
    {
      id: 'french-verbs', label: 'Französische Verben', short: 'Konjugation im Präsens', compact: 'Verben',
      purpose: 'Aus einer Verbliste entstehen Karten mit deutscher Bedeutung vorne und Konjugation, Imparfait-Stamm, Hilfsverb und Partizip hinten.',
      source: frenchVerbExample, card: parseFrenchVerbImport(frenchVerbExample).rows[0], prompt: frenchVerbPrompt,
    },
  ];
  return `
    <section class="guide-page" aria-labelledby="guide-title">
      <header class="page-heading">
        <div>
          <h1 class="page-title" id="guide-title" tabindex="-1">Anleitung</h1>
          <p class="page-subtitle">Erstelle Lernkarten aus Notizen, Lernzielen oder Französischlisten.</p>
        </div>
      </header>
      <section class="guide-section" aria-labelledby="guide-format-title">
        <h2 id="guide-format-title">Welchen Kartentyp brauchst du?</h2>
        <div class="guide-tabs" role="tablist" aria-labelledby="guide-format-title">
          ${formats.map(({ id, label, short, compact }, index) => `
            <button type="button" class="guide-tab" role="tab" aria-label="${label}" id="guide-tab-${id}" aria-controls="guide-panel-${id}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">
              <strong${compact ? ' class="guide-tab-full"' : ''}>${label}</strong>
              <span class="guide-tab-hint">${short}</span>
              ${compact ? `<small class="guide-tab-language">Französisch</small><strong class="guide-tab-compact">${compact}</strong>` : ''}
            </button>`).join('')}
        </div>
        ${formats.map((format, index) => promptPanel(format, index, theme, cardSideMarkup)).join('')}
      </section>
      <section class="guide-section guide-workflow" aria-labelledby="guide-workflow-title">
        <h2 id="guide-workflow-title">So kommen die Karten in deinen Lernstapel</h2>
        <ol class="guide-steps">
          <li><strong>Prompt und Material senden</strong><span>Kopiere den Prompt und sende ihn zusammen mit deinen Notizen oder deiner Liste an die KI deiner Wahl.</span></li>
          <li><strong>Antwort einfügen</strong><span>Öffne deinen Lernstapel, wähle <b>Karten importieren</b> und füge den Antworttext ein.</span></li>
          <li><strong>Vorschau prüfen</strong><span>Wähle <b>Import prüfen</b>, korrigiere die Vorschläge bei Bedarf und klicke auf <b>Lernkarten erstellen</b>.</span></li>
        </ol>
      </section>
      <section class="guide-section guide-reference" aria-labelledby="guide-reference-title">
        <h2 id="guide-reference-title">Textformat und Aussprache</h2>
        <details class="guide-disclosure">
          <summary>Karten selbst schreiben</summary>
          <p>Schreibe eine Karte pro Zeile. Das erste Gleichheitszeichen trennt Vorder- und Rückseite.</p>
          <pre class="guide-example"><code>Vorderseite ((Beispielsatz vorne)) = Rückseite ((Beispielsatz hinten))</code></pre>
          <p>Abschnitte in doppelten Klammern erscheinen kleiner unter dem Begriff. Bei Lernzielen setzt du vor jeden Antwortpunkt ein <code>•</code>. Der Beispieltext oben zeigt die genaue Schreibweise.</p>
        </details>
        <details class="guide-disclosure">
          <summary>Französische Genusangaben</summary>
          <p><code>(m)</code> steht für maskulin, <code>(f)</code> für feminin. <code>(m pl)</code> und <code>(f pl)</code> kennzeichnen die Mehrzahl. Bei <code>le</code>, <code>la</code>, <code>un</code> und <code>une</code> genügt der Artikel.</p>
        </details>
        <details class="guide-disclosure">
          <summary>Französische Aussprache anhören</summary>
          <p>Wähle auf der französischen Kartenseite <strong>Begriff</strong> oder <strong>Beispielsatz</strong>. Bei Konjugationskarten kannst du unter <strong>Verbformen</strong> einzelne Präsensformen anhören. Erneutes Antippen stoppt die Wiedergabe.</p>
          <p>Unter <strong>Lernstapel bearbeiten</strong> kannst du die Seite für die Aussprache wählen. Fehlt eine lokale französische Stimme, kannst du sie in den Bedienungshilfen deines Geräts aktivieren.</p>
        </details>
      </section>
    </section>`;
}

export function bindImportGuide(root, { showCopyConfirmation, onImport }) {
  const tabs = [...root.querySelectorAll('.guide-tab')];
  const panels = tabs.map(tab => root.querySelector(`#${tab.getAttribute('aria-controls')}`));
  function selectTab(index) {
    tabs.forEach((tab, position) => {
      const selected = position === index;
      tab.tabIndex = selected ? 0 : -1;
      tab.setAttribute('aria-selected', String(selected));
      panels[position].hidden = !selected;
    });
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(index));
    tab.addEventListener('keydown', event => {
      const targets = {
        ArrowRight: (index + 1) % tabs.length,
        ArrowLeft: (index + tabs.length - 1) % tabs.length,
        Home: 0,
        End: tabs.length - 1,
      };
      if (!Object.hasOwn(targets, event.key)) return;
      event.preventDefault();
      const target = targets[event.key];
      selectTab(target);
      tabs[target].focus();
    });
  });

  panels.forEach(panel => {
    const prompt = panel.querySelector('.guide-prompt');
    const status = panel.querySelector('.guide-copy-status');
    panel.querySelector('[data-guide-copy]').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(prompt.value);
        if (prompt.isConnected) showCopyConfirmation(status, 'Prompt kopiert.');
      } catch {
        if (!prompt.isConnected || panel.hidden) return;
        prompt.focus();
        prompt.select();
        status.textContent = 'Der Prompt ist markiert. Du kannst ihn jetzt kopieren.';
      }
    });
    panel.querySelector('[data-guide-import]').addEventListener('click', event => {
      const source = panel.querySelector('[data-guide-source]').textContent;
      onImport(source, event.currentTarget.dataset.guideImport);
    });
  });
}
