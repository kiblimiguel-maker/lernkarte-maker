# Slate & Indigo – Farbüberarbeitung

Stand: 6. November 2026.

## Umsetzung

- Die grün getönte App-Oberfläche wurde durch neutrale Slate-Flächen und Indigo-Akzente ersetzt. Die helle Standarddarstellung verwendet die angegebene Palette: Hintergrund `#FCFCFD`, Flächen `#FFFFFF`, dezente Flächen `#F9F9FB`, Hover `#F0F0F3`, Rahmen `#E8E8EC`, Trennlinien `#D9D9E0`, Sekundärtext `#60646C`, Text `#1C2024` und primäre Aktionen `#3E63DD`.
- Dunkel verwendet eigenständige Slate-Abstufungen. Indigo-Text ist dort heller als der solide Button-Hintergrund, damit kleine Beschriftungen lesbar bleiben.
- Unter **Einstellungen → Darstellung** gibt es **Hell**, **Dunkel** und **System**. Hell ist der Standard ohne gespeicherte Auswahl. Die Auswahl wird sofort angewendet, im Browser gespeichert und zwischen Tabs synchronisiert. Bei System folgt die App Änderungen des Betriebssystems.
- Die gespeicherte Oberfläche wird bereits vor dem Stylesheet wiederhergestellt und gilt auch während Anmeldung und Laden. Die Browser-Theme-Farbe wird mitgeführt.
- Navigation, Kontextmenüs, Import, Formulare, Suche, Einstellungen, Lernansicht und Spendenbereich verwenden gemeinsame semantische Farben. Feste Dunkelmodus-Farben, die im hellen Modus unlesbar waren, wurden ersetzt. Fehler- und Fokuszustände bleiben klar erkennbar.
- Fach-/Ordnerfarben bleiben individuell. Neue Standardfarben: Indigo, Blau, Salbei, Teal, Amber und Pflaume. Bereits gespeicherte Farben werden nicht überschrieben.
- Alle zehn Kartendesigns bleiben unabhängig von der App-Oberfläche erhalten. Französische Artikel und Geschlechtsmarker inklusive `(m pl)` / `(f pl)` bleiben blau/rot. Die Vokabeldaten und Importformate werden nicht verändert.
- Ein bestehender CSS-Kaskadenfehler wurde behoben: Seitenlabel und Flip-Hinweis auf dunklen Rückseiten hatten die Textfarbe der Vorderseite übernommen. Sie verwenden jetzt zuverlässig die Rückseitenfarbe.

Die Umsetzung orientiert sich an den semantischen Rollen der [Radix-Farbskalen](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale) und den offiziellen [Slate-/Indigo-Farben](https://github.com/radix-ui/colors). Es wurde keine zusätzliche Bibliothek installiert.

## Erfolgreiche Prüfungen

- `npm test`: alle elf Testsuiten erfolgreich. Import, Modell, vollständiges Mischen, Darstellung, Kartendesigns, neue App-Darstellung, Tastatur, Auth-Lifecycle, Bibliothek, Repository und Spendenlogik.
- Neue Tests: Standard/ungültige Auswahl, blockierter Browser-Speicher, Persistenz, Systemwechsel, Mehrtab-Synchronisierung, Listener-Abbau und tatsächlicher Vorab-Bootstrap aus der HTML-Datei.
- 80 Prüfungen der tatsächlichen CSS-Farbrollen: mindestens **4.5:1** für Text, Sekundärtext, Indigo-Text, Fehlermeldungen und Geschlechtsfarben auf den relevanten hellen/dunklen Flächen sowie für weisse Button-Beschriftungen.
- `npm run build`: erfolgreich.
- `git diff --check`: erfolgreich.
- `npm audit --omit=dev`: keine bekannten Schwachstellen.
- Alle CSS-Keyframes und vier Lernanimations-/Timing-Tokens gegenüber dem Ausgangsstand unverändert. Bewertungsswipe weiterhin 500 ms; normale Vorwärts-/Zurücknavigation bleibt unmittelbar.

## Tatsächliche Browserprüfung

Die bestehenden App-Module, HTML und CSS wurden mit einem isolierten lokalen Testadapter geprüft. Die Testdateien und Testinhalte werden nicht veröffentlicht. Produktive Lerninhalte wurden nicht verändert.

- Bibliothek, Fach-/Ordnerübersicht und Lernstapel visuell geprüft; Einstellungen und Lernstapel in Hell und Dunkel verglichen.
- Einstellungen: unmittelbarer Wechsel, gespeicherter Dunkelmodus nach Reload, Systemauswahl nach Reload sowie sichtbarer Wechsel eines zweiten Tabs geprüft.
- Alle 20 Kartenvorschauflächen: berechnete Hintergrund-, Text- und Geschlechtsfarben sind beim Wechsel der App-Darstellung identisch geblieben.
- Lernansicht: dunkle Graphit-Rückseite sowie Originaldesign geprüft; Labels, Beispielsätze, Artikel und Pluralmarker korrekt sichtbar.
- Leertaste, M, N, Zurücknavigation, Mischen nach Bewertungen und Rückkehr zur Kartenverwaltung geprüft. Gespeicherte Bewertungen und Versuche bleiben zugeordnet.
- Import: gültige Begriffe mit Beispielsatz und Pluralmarker erkannt; ungültige Zeile verständlich dargestellt und Erstellung blockiert.
- Spendenoberfläche und sichtbarer Zustand bei fehlender Stripe-Konfiguration geprüft; keine Zahlung ausgelöst.
- Anmeldeansicht in beiden Darstellungen visuell geprüft.
- Desktop 1440 px, Tablet 834 px und Smartphone 390/320 px geprüft. In den gemessenen mobilen Lern-/Einstellungsansichten kein horizontaler Dokumentüberlauf.
- Keine Konsolenfehler in den geprüften lokalen Abläufen.

## Grenzen und Veröffentlichung

Ein kompletter Google-OAuth-Rundlauf, echte Stripe-Zahlungen, produktive Schreibtests und reale iPhone-/Safari-Hardware wurden in dieser Farbüberarbeitung nicht erneut getestet. Backend, Berechtigungen, Zahlungscode, Sessionmodell und Nutzerdaten wurden nicht verändert. Es ist keine Datenbankmigration erforderlich.

Die Veröffentlichung erfolgt über den vorhandenen `origin/main`-Workflow nach den erfolgreichen Prüfungen. Der verifizierte Commit- und Vercel-Status wird im Abschluss der Unterhaltung genannt.
