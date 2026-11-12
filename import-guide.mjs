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
