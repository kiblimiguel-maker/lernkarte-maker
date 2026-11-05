# Qualitätsprüfung Lernkarten Maker

Stand: 5. November 2026. Ausgangsstand: `a0d5459`.

## Umfang und Architektur

Geprüft wurden die Vite-Anwendung mit `index.html`, `app.js`, `app.css`, Parser, Datenmodell, Präsentations- und Kartendesignmodulen, Supabase-Client und Authentifizierung, Repository samt Migrationen sowie die bestehenden Spenden-Endpunkte. Die Anwendung bleibt bei ihrer vorhandenen Architektur: JavaScript-Module, Supabase Auth und benutzerbezogene JSON-Datensätze, Stripe Checkout und signaturgeprüfte Webhooks. Es wurden keine Bibliotheken ergänzt und keine produktiven Inhalte oder Zahlungsdaten verändert.

## Design und Benutzerführung

- Gemeinsame Tokens für Oberflächen, Texte, Linien, Eingaben, Menüs, Schatten und Rundungen; widersprüchlicher zweiter Tokenblock entfernt.
- Bibliothek mit klarerer Abstufung zwischen farbigen Fächern, Ordnern und Lernstapeln; angeglichene Menüs, Formularfelder, leere Zustände und Dialoge.
- Seitenleiste lässt sich am Desktop ausblenden. Der Zustand bleibt im Browser erhalten. Auf dem Smartphone bleibt die vorhandene Navigation als Drawer nutzbar, inklusive Fokusführung und inaktiver ausgeblendeter Navigation.
- Einheitliche Gestaltung von Anmeldung, Einstellungen, Import und Spendenbereich. Die Hinweise zu globalen Kartendesigns erklären jetzt die Ausnahmen für eigene Stapeldesigns korrekt.
- Lange Lerntitel und Aktionen umbrechen auf kleinen Displays sinnvoll. Eingaben verwenden auf Smartphones 16 px, um unbeabsichtigtes Vergrössern beim Tippen zu vermeiden. Bewertungsaktionen haben klarere mobile Beschriftungen und mindestens 44 px hohe Ziele.
- Original und alle neun weiteren Kartendesigns bleiben vorhanden. Kartenfarben und Rot-Blau-Tokens werden weiterhin vom bestehenden Kartendesignsystem geliefert. Flip- und Swipe-Zeitabläufe, Keyframes und Rotationswerte wurden nicht verändert; die Kartenhöhe ist auf den verfügbaren Bereich begrenzt.

## Lernsteuerung

N bewertet als „Nicht gewusst“, M als „Gewusst“. Beide verwenden die vorhandene Bewertungsfunktion und funktionieren unabhängig von der sichtbaren Kartenseite. Gross- und Kleinschreibung werden unterstützt. Gehaltene Tasten, IME-Eingabe, Strg/Alt/Cmd-Kombinationen, Eingabefelder, Textbereiche und zusätzliche offene Dialoge lösen keine Bewertung aus. Während eines laufenden Kartenwechsels und auf der Ergebnisansicht ist die Bewertung gesperrt.

N/M sind an den Bewertungsbuttons sichtbar und als `aria-keyshortcuts` ausgezeichnet. Auf Touchansichten werden die zusätzlichen Tastaturhinweise ausgeblendet. Leertaste und Pfeile funktionieren auch dann korrekt, wenn zuvor der Schliessen- oder ein Bewertungsbutton fokussiert war. Die native Buttonaktion wird dabei unterbunden. Escape in einem zusätzlichen Dialog beendet die laufende Lerneinheit nicht versehentlich.

## Behobene Stabilitätsfehler

1. **Vollständiges Neuschreiben bei jeder Bewertung:** Gespeichert werden jetzt nur veränderte Datensätze. Die geprüften Tests zeigen, dass eine einzelne geänderte Karte nicht erneut alle Karten überträgt.
2. **Veraltete Tabs konnten fremde Ergänzungen entfernen:** Löschungen betreffen nur zuvor von dieser Instanz geladene und tatsächlich entfernte IDs. Neue Datensätze eines anderen Tabs werden nicht bei einer Bestandsbereinigung gelöscht.
3. **Fehler bei Teilspeicherung:** Erfolgreiche Batches werden nachgehalten. Wiederholen oder ein lokaler Rollback kann bereits geschriebene Datensätze gezielt korrigieren. Es wird weiterhin keine atomare Datenbanktransaktion behauptet.
4. **Unsichtbare Speicherfehler:** Ein dauerhafter Speicherstatus zeigt Fehler an, bietet Wiederholen und versucht bei wiederhergestellter Verbindung erneut zu speichern. Bei ungespeicherten Änderungen wird vor dem Verlassen gewarnt, soweit der Browser dies unterstützt.
5. **Lokaler Stand nach fehlgeschlagener Speicherung:** Ein kontobezogener Wiederherstellungsdatensatz bleibt im Browser erhalten. Nach erneutem Laden entscheidet der Nutzer ausdrücklich zwischen Wiederherstellung und Serverstand. Wiederherstellung erhält zusätzliche Serverdatensätze; lokale Änderungen gewinnen bei gleicher ID. Lokale Löschungen werden dabei nicht automatisch wiederholt. Zurückgerollte Formular- und Organisationsänderungen aktualisieren auch den Wiederherstellungsstand.
6. **Token-Erneuerung lud die Bibliothek neu:** Wiederholte Anmeldeereignisse desselben Nutzers und Token-Erneuerungen erhalten jetzt Workspace und Eingaben. Asynchrone Arbeit wird ausserhalb des Supabase-Auth-Callbacks gestartet.
7. **Verspätete Antworten nach Kontowechsel:** Auth- und Repository-Ladevorgänge sind an Generation und Nutzer gebunden. Ein älterer Ladevorgang kann weder den neuen Workspace anzeigen noch dessen Speicherbesitzer überschreiben. Alte Speicherstatusmeldungen werden nicht auf ein neues Konto übertragen.
8. **Abmelden nach erneutem Login:** Der deaktivierte Zustand des Abmeldebuttons wird zuverlässig aufgehoben.
9. **„Zuletzt gelernt“ nach Reload:** Der Lernzeitpunkt wird am Stapel gespeichert. Die Liste wird aus gespeicherten Stapeln, Sessions und abgeschlossenen Lerneinheiten rekonstruiert. Die eigene Übersicht zeigt bis zu 30 Einträge statt nur der vier Startseiten-Einträge.
10. **Dateiimport überschreibt neuere Eingabe:** Eine verspätet gelesene Textdatei ersetzt keine inzwischen bearbeitete Eingabe und keinen geschlossenen Importdialog.

## Performance

Kartenanzahlen werden pro Bibliotheksrender einmal aus dem Kartenbestand abgeleitet. Das wiederholte Filtern und Sortieren sämtlicher Karten für jede Stapelkachel entfällt bei der Zählung.

Die Kartenverwaltung rendert zunächst 100 Karten und bietet schrittweises Nachladen. Die Suche durchsucht den gesamten Stapel inklusive Beispielsätzen, unabhängig von Grossschreibung und Akzenten. Kartenreihenfolge, Inhalte und Lernfortschritt bleiben dabei unverändert. Auch die Importvorschau zeigt zunächst 100 bearbeitbare Zeilen; sämtliche gültigen Karten bleiben für die Erstellung erhalten. Fehler werden vollständig gezählt, auch wenn nur die ersten 100 Fehler sichtbar sind.

## Erfolgreich automatisiert getestet

`npm test`, `npm run build`, `git diff --check` und `npm audit --omit=dev` wurden nach der Integration erfolgreich ausgeführt. Der Produktionsaudit meldet **0 bekannte Schwachstellen**. Das Projekt hat keine separaten Lint- oder Typecheck-Skripte; es verwendet JavaScript. Der Build und die Tests prüfen die eingebundenen Module.

Die neun Testsuiten decken ab:

- Parser, Unicode, Akzente, Trennzeichen, ungültige Zeilen, Beispielsätze und Stapel mit 50.000 Einträgen.
- Sessionnavigation, Mischen, stabile Karten-IDs, Bewertungen, Bewertungsänderungen, Fortsetzen, Zurücksetzen, Kopieren falscher Karten, Seitentausch und Organisationsmodell.
- Geschlechtererkennung, Kontraste, Originaldesign, alle weiteren Designs und gespeicherte Auswahl.
- N/M, Leertaste, Pfeile, Buttonfokus, Eingabefelder, Dialoge, Modifier, Wiederholungen und Kompositionseingaben.
- Auth-Ereignisse, doppelte Anmeldung, Token-Erneuerung, Logout, Kontowechsel, verspätete Antworten und Fehlerwiederholung.
- Begrenzte Listen, Suche, unveränderte Datensätze und exakte Kartenanzahlen.
- Repository-Batches, unveränderte Speicherungen, einzelne Änderungen, parallele Tabs, Nutzertrennung, Reihenfolge der Anfragen, partielle Fehler, Wiederholung, Cachefehler, Wiederherstellung und überholte Ladevorgänge.
- Bestehende Spendenvalidierung, Beträge, Checkout-Verarbeitung, Signaturen, doppelte Webhooks und Zahlungsstatus. Die absichtlich ungültigen Signaturen und Beträge erzeugen erwartete Warnungen im Testlauf.

## Erfolgreich im Browser geprüft

Die Browserinteraktionen nutzten das tatsächliche App-Markup, CSS und die Module mit isolierten lokalen Testdaten. Die Speicheranbindung dieser Testansicht war ein separater Adapter; die echte Repository-Logik wurde automatisiert getestet. Die Testdateien werden nicht veröffentlicht.

- Bibliothek und Fächer öffnen, einklappbare Desktop-Navigation und mobile Navigation.
- Kartenverwaltung durchsuchen; exakter Treffer auf Karte 9.999 eines Stapels mit 10.000 Karten, obwohl nur 100 Karten gerendert waren.
- Leertaste, N, schnelles doppeltes N, M, Vorderseitenbewertung, Zurücknavigation, Änderung einer Bewertung und Sessionabschluss. Bewertungszähler und Versuchszahl blieben korrekt.
- Zusätzlichen Stapeldialog während des Lernens öffnen, N/M im Namen tippen und mit Escape schliessen; Session und Bewertungen blieben erhalten.
- Ungültiger Import blockiert die Erstellung. Korrigierter Import erstellt Karten mit Umlauten, französischen Akzenten und vollständigem Beispielsatz.
- 250 Importzeilen: zunächst 100 sichtbar, weitere Zeilen nachgeladen, geänderte Eingabe blieb erhalten. 125 Fehler wurden vollständig gezählt und blockierten die Erstellung.
- Absichtlich ausgelöster Speicherfehler beim Fach-Anlegen: Eingaben blieben geöffnet, erneutes Speichern funktionierte.
- Explizite Wiederherstellung eines lokalen Standes; zusätzlicher Lernstapel erschien, Speicherstatus bestätigte den Abschluss.
- Visuelle Prüfung von Desktop-Bibliothek, Smartphone-Kartenverwaltung und Lernmodus sowie Tablet-Einstellungen mit allen 20 Kartenflächen-Vorschauen. Geprüfte Breiten: 320, 390 und 834 px sowie Desktop. In den gemessenen Ansichten kein horizontaler Dokument- oder Dialogüberlauf.
- Mobile Spendenansicht und eindeutiger Zustand bei nicht eingerichteter Zahlungsanbindung.
- Die normalen lokalen Browserläufe zeigten keine Konsolenfehler. Der gezielt ausgelöste Speicherausfall gehört zum Fehlertest.

## Supabase und Sicherheit

Die produktive Datenbank wurde ausschliesslich lesend geprüft. Für `subjects`, `folders`, `sets`, `cards`, `study_sessions` und `study_history` ist RLS aktiviert. Die Policies beschränken Lesen und Schreiben auf `(select auth.uid()) = user_id`, mit `USING` und `WITH CHECK`. Die Rolle `authenticated` besitzt nur SELECT/INSERT/UPDATE/DELETE; `anon` erhielt in den geprüften Bibliothekstabellen keine Rechte.

Der Spendenledger hat RLS und absichtlich keine Browser-Policy: Zugriff ist serverseitig vorgesehen. Der Advisor meldet dies als Information. Eine weitere Advisor-Warnung betrifft deaktivierten Schutz vor geleakten Passwörtern; die aktuelle Oberfläche verwendet Google OAuth, keine Passwörter. Eine spätere Passwortregistrierung sollte diese Einstellung berücksichtigen. [Supabase-Passwortschutz](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Server-Secrets werden weiterhin nur in serverseitigen Umgebungsvariablen gelesen. Die Frontend-Konfiguration verwendet den öffentlichen Supabase-Schlüssel. OAuth-Parameter werden aus Analytics-URLs entfernt. Keine Schemaänderung, Migration oder Änderung produktiver Berechtigungen war für dieses Upgrade erforderlich.

## Teilweise oder nicht getestet; verbleibende Grenzen

- Vollständiger Google-OAuth-Rundlauf, zwei echte Konten mit produktiven Schreibzugriffen und reale iPhone-/Safari-Hardware wurden nicht ausgeführt. Kontowechsel und Fehlerfälle sind mit kontrollierten asynchronen Testantworten geprüft.
- Drag-and-drop, Verschieben, Sortieren und deren Datenpersistenz sind durch vorhandene Modell-/Repositorytests abgedeckt; frühere Browserprüfungen stehen in `DESIGN-VERIFICATION.md`. Dieser Durchlauf hat keine produktive Neuorganisation vorgenommen und nicht jede Drag-Geste erneut manuell wiederholt.
- Dauerhaftes Löschen produktiver Daten wurde nicht getestet. Lösch- und Resetlogik sind automatisiert abgedeckt; keine Nutzerinhalte wurden entfernt.
- Browsercache und Wiederherstellung setzen verfügbaren Speicher voraus. Blockierter oder voller Browser-Speicher kann keine lokale Sicherung garantieren. Die App ist kein vollständig offlinefähiges Produkt.
- Mehrere Tab-Änderungen an derselben Karte werden weiterhin nach dem letzten erfolgreichen Schreibvorgang gespeichert. Es gibt keine serverseitige Konfliktauflösung oder atomare Transaktion über alle Tabellen. Zusätzliche unbekannte Datensätze werden jetzt geschützt.
- Stripe meldete bei der öffentlichen Bereitschaftsabfrage `configured: false`. Echte oder gehostete Stripe-Testzahlungen wurden nicht ausgeführt. Vor Live-Spenden müssen die in `docs/stripe-donations.md` beschriebenen Vercel-/Stripe-Variablen und Webhook-Einstellungen vollständig eingerichtet und der gehostete Ablauf geprüft werden. Die kostenlose App ist davon unabhängig nutzbar.

## Veröffentlichung

Die Veröffentlichung erfolgt über den bestehenden Git-Workflow auf `origin/main` und Vercel nach erfolgreicher Prüfung. Der abschliessende Deployment-Status wird im Abschlussbericht genannt; dieser Bericht allein behauptet keine erfolgreiche Live-Zahlung.
