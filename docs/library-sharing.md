# Ordner und Lernstapel teilen

Über **Teilen** in der Detailansicht oder im Kartenmenü lässt sich ein wiederverwendbarer Freigabelink erstellen. Wer den Link hat, sieht den Titel und die Anzahl der enthaltenen Elemente. Zum Import ist eine Anmeldung nötig. Das Zielfach kann gewählt werden. Standardmässig wird **Geteilt mit dir** verwendet und bei Bedarf angelegt.

Der Import übernimmt den zu diesem Zeitpunkt vorhandenen Inhalt, einschliesslich Unterordnern, Reihenfolge, Farben, Kartendesign und Beispielsätzen. Die Bibliothek speichert Karten als Text und hat keine verknüpften Mediendateien. Die Kopien erhalten neue IDs und einen frischen Lernfortschritt. Eine pro Empfänger und Link gespeicherte Bestätigung verhindert doppelte Kopien, auch nach einer unterbrochenen Verbindung. Wer eine importierte Kopie selbst löscht, kann denselben Link danach nicht erneut importieren.

Die Freigabelinks sind zufällige Tokens im URL-Fragment. Die Vorschau liest ausschliesslich die freigegebenen Metadaten. Die bestehende Nutzertrennung der Bibliothek bleibt aktiv. Die privaten Freigabetabellen sind für App-Rollen gesperrt und der Import erfolgt in einer Transaktion.

## In einer Testumgebung prüfen

1. Verwende eine lokale Supabase-Instanz oder ein separates Supabase-Testprojekt. Wende die Migrationen in ihrer Reihenfolge an. Die neue Migration ist [`20261111203927_library_sharing.sql`](../supabase/migrations/20261111203927_library_sharing.sql).
2. Setze `VITE_SUPABASE_URL` und `VITE_SUPABASE_PUBLISHABLE_KEY` in der lokalen App oder im Vercel-Preview auf das Testprojekt. Lass `public` in der Supabase Data API verfügbar und füge `library_sharing` den exponierten Schemas nicht hinzu.
3. Konfiguriere für einen echten Google-Login im Testprojekt Google OAuth und erlaube die Test-URL der App unter **Authentication → URL Configuration**. Der Freigabelink braucht keine eigene Redirect-Regel, da der Login zum bisherigen App-Pfad zurückführt.
4. Öffne einen Freigabelink in einem privaten Browserfenster. Prüfe die Vorschau vor und nach der Anmeldung. Importiere einen einzelnen Lernstapel und einen Ordner mit Unterordnern mit mindestens zwei Testkonten. Ändere und lösche danach das Original und kontrolliere die erhaltenen Kopien. Öffne einen Link erneut und prüfe, dass keine zweite Kopie entsteht.
5. Führe `npm test`, `npm run build` und `git diff --check` aus. Die [SQL-Regressionssuite](../supabase/checks/library-sharing.sql) kann auf einer isolierten Datenbank mit angewandten Migrationen ausgeführt werden.

```sh
psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f supabase/checks/library-sharing.sql
```

## Nach Freigabe veröffentlichen

Wende zuerst die neue Migration im produktiven Supabase-Projekt an und veröffentliche anschliessend den Frontend-Build über den bestehenden Vercel-Workflow. Für die Funktion braucht es keine zusätzlichen Vercel-Routen, keine neuen Umgebungsvariablen und keine Änderungen an bestehenden Google-Redirects. Prüfe danach einen vollständigen Freigabeablauf mit Testinhalten und zwei Konten.
