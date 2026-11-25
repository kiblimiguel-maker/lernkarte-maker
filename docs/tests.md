# Tests

Der Navigationspunkt **Tests** ersetzt **Zuletzt gelernt**. Ein Test hat einen Namen, ein Fach und ein Kalendertag-Datum. Die Übersicht trennt bevorstehende und vergangene Termine und lässt sich nach Fach filtern. Vergangene Tests bleiben erhalten.

Beim Anlegen bleibt der Name leer. Das Testdatum kann als `TT.MM.JJJJ` oder als acht Ziffern eingegeben sowie über das Kalendersymbol ausgewählt werden. Beide Eingaben bleiben synchron; unmögliche Daten werden zurückgewiesen. Gespeichert wird weiterhin ausschliesslich das ISO-Datum `JJJJ-MM-TT`.

Zu einem Test gehören vorhandene Lernstapel, neue Lernstapel, Notizen und Weblinks. Vorhandene Stapel werden zugeordnet und behalten ihren ursprünglichen Ablageort sowie den Lernfortschritt. Derselbe Stapel kann zu mehreren Tests gehören. Online-Dateien können über einen Link ergänzt werden. Ein direkter Datei-Upload gehört nicht zu dieser Version.

Neue Stapel können direkt im Test erstellt werden. Die normale Lern-, Import-, Bearbeiten- und Verschieben-Funktion bleibt über ihre Stapelansicht verfügbar. Beim Entfernen eines Tests werden darin gespeicherte Stapel und Unterordner eine Ebene nach oben verschoben. Zugeordnete Stapel und alle Lernkarten bleiben erhalten.

## Speicherung

Tests sind terminierte Bibliothekscontainer im bestehenden `folders.data`-JSON. Sie verwenden `kind: 'exam'`, `examDate`, `examNotes`, `examLinks` und `examSetIds`. Die vorhandene Fachbeziehung, Benutzerzuordnung, RLS, Schreibwarteschlange und Wiederherstellung bleiben zuständig. Eine neue Tabelle, Storage-Bucket oder Datenbankmigration ist nicht erforderlich.

Referenzierte Lernstapel werden ausschliesslich aus der eigenen geladenen Bibliothek und demselben Fach aufgelöst. Ungültige oder inzwischen entfernte Verweise werden nicht geladen. Datumswerte werden als lokale Kalendertage behandelt, sodass Zeitzonen und Sommerzeit die Tagesanzeige nicht verschieben. Links erlauben HTTP und HTTPS ohne Zugangsdaten; Titel und Notizen werden als Text ausgegeben.

Das Fach eines Tests kann nachträglich geändert werden. Dabei wird der Test samt eigenen Unterordnern und darin gespeicherten Stapeln mit der vorhandenen atomaren Organisationsfunktion verschoben. IDs, Karten und Lernfortschritt bleiben erhalten. Verknüpfte Stapel bleiben in ihrem ursprünglichen Fach und weiterhin im Test sichtbar. Der Fachwechsel wird zuerst gespeichert; weitere Formulareingaben folgen danach. Falls nur dieser zweite Schritt fehlschlägt, bleibt das bereits gespeicherte neue Fach bestehen und der Dialog bietet das erneute Speichern der Eingaben an.

Über **Teilen** lässt sich eine feste Version des Tests freigeben. Testdatum, Notizen, Weblinks, eigene Unterordner und alle zugeordneten Lernstapel samt Karten werden als Momentaufnahme gespeichert. Empfänger wählen ihr eigenes Zielfach. Die Testkachel verwendet dessen aktuelle Farbe. Einzelheiten, Löschfälle und die erforderliche Datenbankerweiterung stehen in [library-sharing.md](library-sharing.md).

## Prüfungen

`npm test` enthält Datums-, Validierungs-, XSS-, Metadaten- und Zuordnungsprüfungen. `npm run test:exams` prüft die Oberfläche mit separat vorhandenem Playwright. Modul- und Browserpfade werden über die gleichen Umgebungsvariablen wie bei den anderen Browserprüfungen angegeben. Die Prüfung startet ausschliesslich eine isolierte Vorschau mit Testdaten und blockiert unerwartete externe Aufrufe.

Die Browserprüfung deckt Erstellen, Bearbeiten, Speichern nach Verbindungsfehlern, Neuladen, Fachfilter, Lernstapelzuordnung, Lernen, neue Stapel und Karten sowie das Entfernen eines Tests bei erhaltenen Lernkarten ab. Dazu gehören leere neue Testnamen, Tastatureingaben, ungültige Daten, die Synchronisierung mit dem nativen Datumsfeld und der Einstieg mit einer leeren Bibliothek. Produktive Nutzerdaten werden dabei nicht verändert.
