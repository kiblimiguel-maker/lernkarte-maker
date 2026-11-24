# Interaktionen und Bewegung

Die bestehenden Farben, Kachelgrössen und die Zwei-Slot-Lernkarten bleiben erhalten. Kurze Druckzustände reagieren sofort; die Rückkehr dauert 90 ms. Menüs verwenden 150 ms, Dialoge 180 ms und Sortierbewegungen 160 ms. Die Werte und die gemeinsame Bewegungskurve stehen in `app.css`.

Bewegung verwendet Transformieren, Skalieren und Deckkraft. Kleine Bedienelemente behalten dezente Farbübergänge. Es gibt keine neue Animationsbibliothek, dauerhaften Effekt oder zusätzliche Serverabfrage. Ansichten wechseln sofort. Die Überschrift wird nur beim tatsächlichen Navigieren animiert.

Drag & Drop misst die unskalierte Kachel und beendet laufende Animationen beim Aktivieren von reduzierter Bewegung. Nach Abschluss, Abbruch oder einer neuen Aufnahme werden die alten Animationen und die zugehörige Medienabfrage aufgeräumt. Ein ruhender Zeiger erzeugt keine dauerhafte Animationsschleife; Bewegung und automatisches Scrollen bleiben über `requestAnimationFrame` gebündelt.

## Wiederholbare Prüfungen

`npm test` führt die automatisierten Prüfungen einschliesslich Drag-Abbruch, reduzierter Bewegung und Aufräumen aus. `npm run build` prüft den veröffentlichbaren Build.

`npm run test:interactions` führt die zusätzliche Browserprüfung aus. Sie benötigt separat vorhandenes Playwright samt Browsern. Bei einer externen Testinstallation wird `PLAYWRIGHT_MODULE` auf deren Modulverzeichnis gesetzt; für einen vorhandenen Chromium-Browser kann zusätzlich `PLAYWRIGHT_CHROMIUM_EXECUTABLE` gesetzt werden. Es wird nichts heruntergeladen. Die Prüfung startet eine lokale Vorschau, verwendet ausschliesslich Testdaten und sperrt unerwartete externe Aufrufe. `QA_ENGINES` und `QA_CARD_COUNT` erlauben weitere Prüfgrössen.

## Beobachtete Ergebnisse am 24. November 2026

Chromium und WebKit bestanden schnelle Navigation, wiederholtes Umdrehen, Kartenwechsel, Bewertungen, Mischen, Wiederholung, Fokuswiederherstellung und den Wechsel zu reduzierter Bewegung. Die Bildschirmgrössen waren 1366 × 768, 390 × 740 und 320 × 568 Pixel. Ergänzende Bedienprüfungen deckten Menüs, wiederholte Dialogwechsel, letzte Formularfelder, Fehler- und Erfolgsmeldungen sowie emuliertes Touch-Dragging ab.

In der lokalen Prüfung mit 1’813 Karten lagen die synchronen Bewertungsaktionen zwischen etwa 1 und 1,8 ms. Das 95. Perzentil der gemessenen Bildintervalle lag bei 16,7 bis 18 ms. Chromium meldete im kurzen Messfenster keine langen Aufgaben. Diese Werte sind Beobachtungen auf dem Testrechner; sie messen keinen vollständigen Eingabe-bis-Bildschirm-Durchlauf auf physischen Mobilgeräten.

Die zusätzliche Prüfung mit 50’000 Karten bestand funktional. Eine Bewertung benötigte dort etwa 22,4 ms und das 95. Perzentil der Bildintervalle lag bei 33,3 ms. Die bestehende Speicherung vergleicht weiterhin die ganze Bibliothek. Deshalb wird keine geräteunabhängige Garantie für 60 FPS gegeben. Diese Änderung ersetzt die bewährte Speicherlogik nicht durch ein verzögertes Speichern.

Produktive Nutzerdaten wurden für diese Prüfungen nicht verändert. Die Animationen benötigen keine Datenbankmigration.
