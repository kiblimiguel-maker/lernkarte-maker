# Ordner und Lernstapel teilen

## Tests teilen

Die Test-Detailansicht bietet **Teilen → Link erstellen**. Dieser neue Freigabetyp benötigt die vorbereitete Migration `20261125195143_exam_share_snapshots.sql`. Sie wird erst nach ausdrücklicher Freigabe auf die produktive Datenbank angewendet.

Ein Testlink enthält eine unveränderliche Momentaufnahme beim Erstellen: Testname, Datum, Notizen, Weblinks, eigene Unterordner und alle zugeordneten Lernstapel samt Karten, Beispielsätzen, Kartendesign und Aussprache-Einstellung. Ein mehrfach zugeordneter Stapel wird einmal übernommen. Verknüpfte Stapel aus anderen eigenen Fächern werden mitkopiert; fremde Konten und nicht ausgewählte Nachbarstapel werden nicht aufgenommen. Lernfortschritte werden nicht geteilt.

- **Originaltest, Originalstapel oder ursprüngliches Fach gelöscht:** Der Testlink bleibt gültig. Auch wer ihn erst danach öffnet, kann die gespeicherte Version importieren.
- **Original später geändert:** Ein schon verschickter Link behält seinen Stand. Erneutes Erstellen nach Inhaltsänderungen erzeugt einen neuen Link; unveränderte Inhalte verwenden denselben Link wieder.
- **Empfänger importiert:** Es entstehen neue IDs und ein eigener Lernfortschritt. Löschen oder Bearbeiten beim Absender verändert diese Kopie nicht.
- **Zielfach:** Vor dem Hinzufügen kann jedes eigene Fach gewählt werden. Standard ist „Geteilt mit dir“, das bei Bedarf angelegt wird. Der Test übernimmt die Farbe des gewählten Fachs und reagiert auch auf spätere Änderungen dieser Fachfarbe.
- **Derselbe Link nochmals hinzugefügt:** Solange die eigene Testkopie existiert, wird sie geöffnet statt dupliziert. Auch wenn sie inzwischen das Fach gewechselt hat, wird ihr aktueller Ort zurückgegeben. Nach dem Löschen der eigenen Testkopie ist ein neuer Import möglich.
- **Externe Unterlagen:** Gespeichert wird deren Webadresse. Externe Dateien selbst werden nicht kopiert; verschwinden sie beim jeweiligen Anbieter oder fehlen dort Zugriffsrechte, kann die App sie nicht verfügbar halten.
- **Linkschutz:** Wer den zufälligen Link besitzt, sieht Titel, Datum und Anzahlen. Zum Kopieren ist eine Anmeldung nötig. Die internen Snapshot-Tabellen sind für App-Konten nicht direkt lesbar oder veränderbar. Das Löschen des Absenderkontos entfernt dessen gespeicherte Freigaben.

Der Testimport ist eine Transaktion. Ungültige Zielfächer werden abgewiesen, unterbrochene Importe hinterlassen keine halben Kopien und parallele Importe eines Kontos werden serialisiert. Eine Momentaufnahme ist auf 25 MiB begrenzt. Es werden keine bestehenden Nutzerdaten oder bisherigen Freigaben umgeschrieben.

Die bisherigen **Ordner- und Lernstapellinks** behalten ihr unten beschriebenes Verhalten: Noch nicht importierte Inhalte hängen dort weiterhin am Original. Das neue Fortbestehen nach Löschen gilt für die neuen **Testlinks**.

### Isoliert prüfen

`supabase/checks/exam-sharing.sql` prüft Eigentümertrennung, anonyme Vorschau, eigene Zielfächer, querverknüpfte und verschachtelte Inhalte, frischen Lernfortschritt, wiederholte Importe, Änderungen und Löschung des Originals, späten Erstimport, Wiederherstellen gelöschter Testkopien und vollständigen Rollback bei einem absichtlichen Schreibfehler. Alle Testdaten werden zurückgerollt. Niemals diese Fehlersimulation auf der produktiven Datenbank ausführen.

Optional lässt sich die Prüfung ohne Server mit separat installiertem `@electric-sql/pglite` ausführen:

```sh
PGLITE_MODULE=/absoluter/pfad/zu/node_modules/@electric-sql/pglite npm run test:sharing-db
```

Sie verwendet ausschliesslich eine isolierte PostgreSQL-Instanz im Arbeitsspeicher, prüft die neue Migration sowohl mit dem bisherigen Produktionsstand als auch mit allen lokalen Freigabe-Migrationen und führt die bestehenden Freigabeprüfungen zusätzlich aus. Weder Konten noch Produktivdaten werden angesprochen.

## Bisherige Ordner- und Lernstapellinks

Über **Teilen** in der Detailansicht oder im Kartenmenü lässt sich ein wiederverwendbarer Freigabelink erstellen. Wer den Link hat, sieht den Titel und die Anzahl der enthaltenen Elemente. Zum Import ist eine Anmeldung nötig. Das Zielfach kann gewählt werden. Standardmässig wird **Geteilt mit dir** verwendet und bei Bedarf angelegt.

Der Import übernimmt den zu diesem Zeitpunkt vorhandenen Inhalt, einschliesslich Unterordnern, Reihenfolge, Farben, Kartendesign, Aussprache-Einstellung und Beispielsätzen. Die Bibliothek speichert Karten als Text und hat keine verknüpften Mediendateien. Die Kopien erhalten neue IDs und einen frischen Lernfortschritt. Eine pro Empfänger und Link gespeicherte Bestätigung verhindert doppelte Kopien, auch nach einer unterbrochenen Verbindung. Wer eine importierte Kopie selbst löscht, kann denselben Link danach nicht erneut importieren.

Die Freigabelinks sind zufällige Tokens im URL-Fragment. Die Vorschau liest ausschliesslich die freigegebenen Metadaten. Die bestehende Nutzertrennung der Bibliothek bleibt aktiv. Die privaten Freigabetabellen sind für App-Rollen gesperrt und der Import erfolgt in einer Transaktion.

## In einer Testumgebung prüfen

1. Verwende eine lokale Supabase-Instanz oder ein separates Supabase-Testprojekt. Wende die Migrationen in ihrer Reihenfolge an. Die Freigabe wurde mit [`20261111203927_library_sharing.sql`](../supabase/migrations/20261111203927_library_sharing.sql) eingeführt. [`20261116064041_preserve_shared_study_settings.sql`](../supabase/migrations/20261116064041_preserve_shared_study_settings.sql) übernimmt explizite Einstellungen zur französischen Aussprache in neue Kopien.
2. Setze `VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY` in der lokalen App oder im Vercel-Preview auf das Testprojekt. Lass `public` in der Supabase Data API verfügbar und füge `library_sharing` den exponierten Schemas nicht hinzu.
3. Konfiguriere für einen echten Google-Login im Testprojekt Google OAuth und erlaube die Test-URL der App unter **Authentication → URL Configuration**. Der Freigabelink braucht keine eigene Redirect-Regel, da der Login zum bisherigen App-Pfad zurückführt.
4. Öffne einen Freigabelink in einem privaten Browserfenster. Prüfe die Vorschau vor und nach der Anmeldung. Importiere einen einzelnen Lernstapel und einen Ordner mit Unterordnern mit mindestens zwei Testkonten. Ändere und lösche danach das Original und kontrolliere die erhaltenen Kopien. Öffne einen Link erneut und prüfe, dass keine zweite Kopie entsteht.
5. Führe `npm test`, `npm run build` und `git diff --check` aus. Die SQL-Regressionsprüfungen für [Freigaben](../supabase/checks/library-sharing.sql) und [Bibliotheksorganisation](../supabase/checks/library-organisation.sql) legen Testdaten in Transaktionen an und rollen sie am Ende zurück. Führe sie in der isolierten Datenbank mit angewandten Migrationen aus.

```sh
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f supabase/checks/library-sharing.sql \
  -f supabase/checks/library-organisation.sql
```

## Nach Freigabe veröffentlichen

Wende die vorbereitete Migration im produktiven Supabase-Projekt erst nach Freigabe an. Die Korrektur greift bei neuen Importen über die bestehende Freigabe-Oberfläche. Vorhandene Kopien behalten ihre bisherigen Einstellungen. Prüfe danach einen vollständigen Freigabeablauf mit Testinhalten und zwei Konten.
