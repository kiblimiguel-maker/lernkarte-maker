export function showCardVersions(container, conflicts, deckName, onChoose) {
  container.replaceChildren();
  for (const [index, { local, remote }] of conflicts.entries()) {
    const group = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = deckName(remote.setId) || 'Lernkarte';
    group.append(legend);
    for (const [source, label, card] of [['local', 'Auf diesem Gerät', local], ['remote', 'Online gespeichert', remote]]) {
      const option = document.createElement('label');
      const heading = document.createElement('strong');
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `card-version-${index}`;
      radio.addEventListener('change', () => onChoose(card.id, { source, remote }));
      heading.append(radio, label);
      option.append(heading);
      for (const [side, caption] of [['front', 'Vorderseite'], ['back', 'Rückseite']]) {
        const name = document.createElement('small');
        name.textContent = caption;
        const text = document.createElement('span');
        text.textContent = [card[side], card[`${side}ExampleSentence`]].filter(Boolean).join('\n');
        option.append(name, text);
      }
      group.append(option);
    }
    container.append(group);
  }
}
