export const importGuideExamples = [
  'dauern ((Das Konzert dauert zwei Stunden.)) = durer ((Le concert dure deux heures.))',
  'ein Sportler / eine Sportlerin ((Meine Eltern sind echte Sportler.)) = un sportif / une sportive ((Mes parents sont de vrais sportifs.))',
  'Es kostet Eintritt. ((Es kostet Eintritt.)) = l’entrée (f) est payante ((L’entrée est payante.))',
  'die Angestellten ((Die Angestellten arbeiten im Museum.)) = les employés (m pl) ((Les employés travaillent au musée.))',
  'Outfits ((Ich suche Outfits für die Ferien.)) = des tenues (f pl) ((Je cherche des tenues pour les vacances.))',
  'am Flughafen ((Wir treffen uns am Flughafen.)) = à l’aéroport (m) ((Nous nous retrouvons à l’aéroport.))',
];

export const frenchImportPrompt = `Erstelle aus dem hochgeladenen Vokabular eine Deutsch-Französisch-Liste für Lernkarten Maker. Übernimm die Einträge in der Reihenfolge der Vorlage. Schreibe genau eine Lernkarte pro Zeile.

Schreibe jede Zeile in diesem Format.
Deutscher Begriff ((Deutscher Beispielsatz.)) = Französischer Begriff ((Französischer Beispielsatz.))

Verwende genau ein Gleichheitszeichen als Trennzeichen. Schreibe auf beiden Seiten zuerst den Begriff und danach den Beispielsatz in doppelten Klammern. Übernimm einen passenden französischen Beispielsatz aus der Vorlage. Wenn keiner vorhanden ist, formuliere einen kurzen, natürlichen französischen Satz. Verwende links den dazu passenden deutschen Satz aus der Vorlage oder übersetze den französischen Satz ins Deutsche.

Kennzeichne französische Nomen bei Formen wie les, des, l’, à l’, au, du und aux sowie bei fehlendem Artikel. Setze die Angabe direkt hinter das zugehörige Nomen. Verwende (m) für maskulin Singular, (f) für feminin Singular, (m pl) für maskulin Plural oder (f pl) für feminin Plural. Übernimm vorhandene Genusangaben in dieser Schreibweise, wo eine Angabe nötig ist. Bei le, la, un und une genügt der Artikel für das jeweilige Nomen. Für Verben, Adjektive und Adverbien entfällt die Angabe.

Gib ausschliesslich die fertigen Vokabelzeilen aus. Verwende keine Stichpunkte, Nummerierung, Überschrift, Kopfzeile, Fusszeile oder Markdown-Codeblöcke. Die folgenden Zeilen zeigen das Format. Verwende für die Ausgabe die Einträge aus meiner Vorlage.

${importGuideExamples.join('\n')}`;

export const learningGoalImportExample = 'Erkläre den Wasserkreislauf. = • Wasser verdunstet von Seen, Flüssen und Meeren. • Wasserdampf kondensiert und bildet Wolken. • Niederschlag gelangt in Gewässer oder versickert im Boden.';

export const learningGoalPrompt = `Erstelle aus meinen hochgeladenen Unterlagen Lernkarten für Lernkarten Maker. Verwende die Lernziele aus der Vorlage. Wenn keine Lernziele genannt sind, formuliere passende Lernziele aus den wichtigsten Inhalten. Prüfe, dass sich jede Antwort mit der Vorlage belegen lässt. Ergänze keine erfundenen Informationen und lass ein Lernziel aus, wenn die Unterlagen keine Antwort darauf geben.

Schreibe genau eine Lernkarte pro Zeile. Links steht das Lernziel in der Sprache der Unterlagen. Formuliere es so, dass es auch ohne die Vorlage verständlich ist, zum Beispiel «Erkläre …» oder «Nenne …». Rechts stehen die wichtigsten Antworten in kurzen Stichpunkten. Verwende im Lernziel kein Gleichheitszeichen. Das erste «=» trennt Lernziel und Antwort. Beginne jeden Stichpunkt mit dem Zeichen «•» und halte sämtliche Stichpunkte derselben Karte in derselben Zeile.

Verwende keine zusätzliche Überschrift, Nummerierung, Fusszeile oder Markdown-Codeblöcke. Gib nur die fertigen Importzeilen aus. Dieses Beispiel zeigt den Aufbau. Nutze für die Ausgabe meine Unterlagen.

${learningGoalImportExample}`;
