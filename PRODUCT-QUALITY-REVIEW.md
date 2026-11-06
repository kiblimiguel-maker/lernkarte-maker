# Produkt- und Qualitätsprüfung · Lernkarten Maker

Stand: 6. November 2026. Ausgangsstand: `9b08b9f`.

## Ergebnis und Umfang

Die bestehende Anwendung wurde als zusammenhängendes Produkt geprüft und gezielt weiterentwickelt. Schwerpunkt waren eine ruhigere visuelle Identität, die Orientierung in grösseren Bibliotheken und reproduzierbare Fehler beim Wiederaufnehmen einer Lernsession. Die vorhandene Vite-/JavaScript-Architektur, Supabase-Anmeldung, benutzerbezogenen Datensätze und Stripe-Endpunkte bleiben erhalten. Es wurden keine zusätzlichen Abhängigkeiten, Datenbankmigrationen oder produktiven Datenänderungen vorgenommen.

Untersucht wurden Bibliothek, Fach-/Ordnerhierarchie, Sortierung und Verschieben, Kartenverwaltung, Import, Lernsession, Kartendesigns, Einstellungen, Anmeldeoberfläche und Spendenbereich. Technisch wurden Datenmodell, Präsentationsmodule, Auth-Lifecycle, Repository, API-Code und vorhandene Migrationen einbezogen.

## Designkonzept und Umsetzung

Die App-Oberfläche verwendet warmes Graphit, helles Elfenbein und einen zurückhaltenden Salbeiakzent. Hintergrund, Oberflächen, Eingaben, Text, Rahmen sowie Warn- und Fehlerzustände haben gemeinsame semantische Farbrollen. Bestehende individuell gespeicherte Fach- und Ordnerfarben bleiben unverändert; neue Standardvorschläge verwenden eine abgestimmte Palette aus Jade, Kobalt, Ocker, Terrakotta und verwandten Farben.

- Über 300 durch spätere identische Regeln überschriebene CSS-Deklarationen entfernt. Die Reihenfolge verbleibender Regeln bleibt erhalten; es wurde kein zusätzliches vollständiges Design-Override angehängt.
- Typografie, Abstände, Radien, Menüs, Formularfelder und Aktionshierarchie vereinheitlicht. Seitenüberschriften sind zurückhaltender, Metadaten und Designvorschauen besser lesbar.
- Lernstapel kompakter angeordnet; farbige Fächer, erkennbare Ordnersilhouetten und kleine Kartenstapel bleiben visuell unterscheidbar.
- Wiederkehrende Navigationssymbole als konsistente SVG-Konturen umgesetzt, ohne Icon-Bibliothek.
- Tastaturfokus auf der Lernkarte durch einen deutlichen Aussenring erkennbar. Eingabefeldgrenzen nach gemessener Kontrastprüfung verstärkt.
- Kartenverwaltung zeigt sichtbare Spaltenbezeichnungen für Vorder- und Rückseite.
- Einstellungen mit allen zehn Kartendesigns und zwanzig Vorder-/Rückseitenvorschauen bleiben erhalten; die Auswahlrahmen wurden vereinfacht.
- Spendenbegrüssung als kurzer Hinweis unterhalb der Seitenüberschrift, mit zurückhaltenden Aktionen und unveränderter Ausblendmöglichkeit. Spendenansicht, Login, Import und Dialoge nutzen dasselbe Oberflächensystem.

Gemessene Kontraste im Browser: Haupttext zum App-Hintergrund ca. **15,2:1**, Sekundärtext zur Oberfläche **7,2:1**, primärer Button **9,7:1**, verstärkte Eingabefeldgrenze zum Eingabehintergrund **3,38:1**. Das ist keine vollständige WCAG-Zertifizierung. Bestehende Kartendesign-Kontraste werden zusätzlich automatisiert geprüft.

Die Farbpaletten der Lernkarten sind vom App-Chrome getrennt. Originaldesign, alle weiteren Designs, schwarze/weisse Begriffsschrift sowie blaue und rote Geschlechtsmarker inklusive `(m pl)` / `(f pl)` bleiben erhalten. Der bestehende dunkle App-Modus wurde verfeinert; ein neuer globaler Light Mode wurde nicht ergänzt.

## Informationsarchitektur und Bibliothek

Die Hierarchie bleibt **Fach → optionaler Ordner/Unterordner → Lernstapel**. Ein Stapel kann weiterhin direkt auf Fach-Ebene liegen. Bestehende Zuordnungen und individuelle Reihenfolgen werden nicht verändert.

Neu ist eine kontextbezogene Suche:

- Bibliothek: Fächer, Ordner und Lernstapel über Namen, Beschreibungen und vollständige Ablagepfade finden.
- Fach: alle Inhalte dieses Fachs inklusive Unterordnern durchsuchen.
- Ordner: im eigenen Zweig und dessen Unterordnern suchen.
- Zuletzt gelernt: nur tatsächlich zugehörige zuletzt verwendete Stapel durchsuchen.
- Grossschreibung und Akzente werden tolerant behandelt. Alle Suchwörter müssen passen.
- Treffer sind nach Inhaltstyp gruppiert und zeigen den Ablageort. Beim Öffnen eines Treffers wird das zugehörige Fach in der Sidebar aufgeklappt.
- Zunächst höchstens 100 Treffer anzeigen, weitere gezielt nachladen. Die Suche verändert weder Datensätze noch die gespeicherte Reihenfolge.
- Sortiermodus und Suche bleiben klar getrennt. Bei leerer Suche erscheint die bestehende Übersicht wieder.

Beim Wechsel des App-Bereichs beginnt die Ansicht wieder oben. Neudarstellungen innerhalb desselben Bereichs setzen die Scrollposition nicht pauschal zurück.

## Behobene funktionale Fehler

1. **Nicht bedienbare wiederhergestellte Wiederholungs-Session:** Veraltete Verlaufsdaten konnten eine Karte auswählen, die noch im Originalstapel, aber nicht mehr im gespeicherten Wiederholungsumfang enthalten war. Bewertungen, Verlauf und aktuelle Karte werden nun konsistent auf die tatsächlichen Session-IDs beschränkt.
2. **Absturz bei unvollständigen alten Sessiondaten:** Ein gespeichertes `results`-Array ohne `cardIds` konnte einen Fehler auslösen. Nicht zuordenbare alte Bewertungen werden jetzt sicher behandelt und keiner beliebigen Karte zugewiesen.
3. **Abschluss nach unterbrochener letzter Bewertung:** Nach einem Reload während der letzten Bewertungsanimation waren alle Antworten gespeichert, „Weiter“ aber deaktiviert. Die Schaltfläche ermöglicht nun eindeutig „Abschliessen“, ohne eine erneute Bewertung oder zusätzliche Versuchszählung zu verlangen.
4. **Veraltete Fortschrittsanzeige nach Lernen beenden:** Beim Schliessen der Lernansicht wird der aktuelle Bibliotheks-/Stapelbereich jetzt erneut dargestellt. Bewertungsstände und Versuche sind sofort sichtbar.
5. **Veralteter zugänglicher Flip-Zustand:** Ein zurückgesetzter Kartenslot setzt auch `aria-pressed` zurück, passend zur sichtbaren Vorderseite.
6. **Orientierung nach Navigation:** Eine vorherige Scrollposition wird nicht mehr in einen anderen App-Bereich übernommen.
7. **Suchbereich nach „Zuletzt gelernt“:** Beim Öffnen eines Stapels oder Ordners wird zuverlässig in den Bibliothekskontext gewechselt. Die anschliessende Fach-/Ordnersuche bleibt dadurch nicht versehentlich auf zuletzt gelernte Stapel beschränkt.

Die Zwei-Slot-Architektur, der separate Flip, die 500-ms-Bewertungsswipe, die sofortige Vorwärts-/Zurücknavigation und die zuletzt korrigierte vollständige Mischfunktion bleiben bestehen. Ein gesonderter Vergleich der CSS-Keyframes und Animationstokens bestätigt unveränderte Bewegungsabläufe und Zeitwerte.

## Erfolgreiche automatisierte Prüfungen

- `npm test`: alle zehn Testsuiten erfolgreich.
- `npm run build`: erfolgreicher Vite-Produktionsbuild.
- `git diff --check`: erfolgreich.
- `npm audit --omit=dev`: **0 bekannte Schwachstellen**.
- `node --check app.js`: erfolgreich. Separate Lint- und Typecheck-Skripte sind im JavaScript-Projekt nicht vorhanden.

Zusätzliche Regressionstests prüfen die kontextbezogene Suche, vollständige Pfade, Fach-/Ordnergrenzen, zuletzt verwendete Stapel, zyklische fehlerhafte Ordnerdaten, exakte Trefferzahlen, unveränderte Quelldaten und begrenzte Ergebnisse bei 10.000 Stapeln. Sessiontests decken Wiederholungs-Teilmengen und unvollständige Legacy-Daten ab.

Die vorhandenen Suiten prüfen weiterhin Parser/Import und Datenverarbeitung mit 50.000 Karten, Mischen, ID-basierte Bewertungen, Fortschritt, Fortsetzen/Reset, Seitentausch, Kopien falscher Karten, Tastaturkonflikte, Auth-Ereignisse und Repository-Fehlerfälle. Erwartete Warnungen bei absichtlich ungültigen Stripe-Signaturen/Beträgen gehören zu den erfolgreichen Fehlertests.

Der komprimierte CSS-Build ist trotz neuer Suchoberfläche kleiner als im Ausgangsstand. Suchergebnisse und Kartenlisten bleiben begrenzt gerendert. Es wird kein gemessener Geschwindigkeitsgewinn auf realer iPhone-Hardware behauptet.

## Praktische Browserprüfung

Die tatsächlichen App-Module, das Markup und CSS liefen mit einem isolierten lokalen Speicheradapter und kontrollierten Testinhalten. Diese Testdateien werden nicht veröffentlicht; produktive Lerninhalte wurden nicht verändert.

Erfolgreich geprüft:

- Desktop-Bibliothek, Fach-/Ordneransichten, verschachtelte Suchtreffer und Öffnen des richtigen Speicherorts.
- Aus „Zuletzt gelernt“ einen Stapel öffnen, zur Fach-Ebene zurückkehren und dort einen bisher nicht gelernten Stapel finden.
- Lernstapel per Drag-and-drop in einen Ordner verschieben; anschliessend über den Verschiebedialog wieder auf Fach-Ebene verschieben. Gespeicherte Zuordnung kontrolliert.
- Fach per Sortierpfeil neu anordnen und die geänderte Reihenfolge nach einem Reload kontrollieren.
- Erstellen ohne Namenseingabe: automatisch „Lernstapel 1“, anschliessend hilfreicher leerer Kartenbestand.
- Leertaste, N und M; schnelles doppeltes N ohne Doppelzählung; Mischen nach Bewertungen und weiterhin korrekte Zuordnung.
- Maskuline/feminine Pluralmarker auf der Rückseite mit tatsächlich berechneten Blau-/Rot-Farben.
- Eigenständigen Stapel aus einer falschen Karte erstellen, ohne laufende Session oder Zähler zu verändern; Beispielsatz und neue Karten-ID erhalten.
- Ungültige Importzeile blockiert Erstellung. Korrigierte Vorschau erstellt beide Karten inklusive französischer Akzente, Pluralmarker und vollständigem Beispielsatz.
- Designwechsel und Reload: „Sky Mint / Graphite“ bleibt gespeichert; sämtliche 20 Designvorschauen vorhanden.
- Reload unmittelbar während der letzten Ein-Karten-Bewertung: Fortsetzen und Abschliessen mit 100 %, genau einem Versuch und einem korrekten Ergebniseintrag.
- Weitere Session beginnen, früh schliessen: zwei Versuche unmittelbar in der Kartenverwaltung sichtbar.
- Bestätigten Reset auf null Versuche und Anfangszustand geprüft.
- Visuelle Prüfung bei Desktopbreiten 1280/1440 px, Tablet 834 px sowie Smartphone 390/320 px. In den gemessenen App-, Lern-, Import- und Einstellungsansichten kein horizontaler Dokument-/Dialogüberlauf.
- Anmeldeansicht visuell geprüft; Spendenansicht mit deaktiviertem Checkout bei fehlender Konfiguration und Rückkehr zur Bibliothek geprüft.
- Keine Konsolenfehler in den geprüften lokalen Abläufen. Die beobachteten Ressourcenanfragen lieferten erfolgreiche Antworten; die lokale Vite-Ansicht ist kein Test der produktiven Zahlungs-API.

## Supabase, Sicherheit und verbleibende Grenzen

Die verbundene Supabase-Datenbank wurde ausschliesslich lesend geprüft. Für alle sechs Bibliothekstabellen ist RLS aktiv. Die Policies beschränken den Zugriff über `auth.uid() = user_id` mit `USING` und `WITH CHECK`. `authenticated` hat CRUD-Rechte; `anon` hat in den geprüften Bibliothekstabellen keine Grants. Der serverseitige Spendenledger hat RLS und absichtlich keine Browser-Policy.

Keine neuen Secrets, Backend-Berechtigungen oder öffentlichen API-Endpunkte wurden eingeführt. Der Advisor meldet weiterhin den deaktivierten Schutz vor geleakten Passwörtern. Die App verwendet Google OAuth; vor einer späteren Passwortanmeldung sollte diese Einstellung berücksichtigt werden. Sie wurde nicht eigenmächtig verändert.

**Nicht vollständig getestet:** kompletter Google-OAuth-Rundlauf, produktive Schreibtests mit zwei echten Nutzerkonten, reale Safari-/iPhone-Hardware, alle möglichen Offline-/Mehrtab-Konflikte und echte Stripe-Zahlungen. Auth- und Repository-Fehlerfälle sind automatisiert abgedeckt. Es bleibt bei der vorhandenen Synchronisationsarchitektur ohne atomare Transaktion über alle Tabellen oder serverseitige Konfliktauflösung für gleichzeitige Änderungen derselben Karte.

Die Stripe-Konfiguration und gehostete Zahlungsabwicklung wurden nicht verändert. Die öffentliche produktive Bereitschaftsabfrage antwortete mit HTTP 200 und `configured: false`. Die App bleibt kostenlos. Live-Spenden dürfen erst nach vollständiger Konfiguration und einem tatsächlich geprüften Zahlungsablauf als funktionsfähig bezeichnet werden; die nötigen Einstellungen sind in [docs/stripe-donations.md](docs/stripe-donations.md) dokumentiert.

## Gestalterische Referenzen

Die Umsetzung ist eine eigene Ableitung aus den geprüften Produktprinzipien: zielgerichtete Farbe und klare Vorder-/Hintergrundrollen aus [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/color), semantische Farbaliasse aus [Microsoft Fluent](https://fluent2.microsoft.design/color), reduzierte visuelle Unruhe und bewusst gewählte Informationsdichte aus [Linears UI-Überarbeitung](https://linear.app/now/how-we-redesigned-the-linear-ui) sowie klare Proportionen aus [OpenAIs Gestaltungsrichtlinien](https://openai.com/brand/). Keine fremde Oberfläche oder Marke wurde kopiert.

## Veröffentlichung

Veröffentlicht wird ausschliesslich der geprüfte Quellstand über den bestehenden Git-/Vercel-Workflow. Der genaue Commit- und Deployment-Status wird im Abschlussbericht der Unterhaltung genannt. Die hier beschriebenen lokalen Browsertests sind kein Nachweis für echte Live-Zahlungen oder einen vollständigen produktiven OAuth-Rundlauf.
