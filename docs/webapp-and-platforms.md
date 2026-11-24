# Web-App für den Unterricht und spätere Plattformen

Die erste Version wird kostenlos über die bestehende HTTPS-Adresse `https://lernkarte-maker.vercel.app/` genutzt. Ein eigener Google-Login öffnet die persönliche Bibliothek. Lernstapel und Ordner lassen sich per Link mit Mitschülern teilen. Nach dem Hinzufügen besitzt jeder Empfänger seine eigene Kopie.

## Installation aus dem Browser

Die Web-App hat ein Manifest mit einer stabilen App-ID, eigenen Installationssymbolen und einem eigenständigen Fenster. Unter **Einstellungen → App auf deinem Gerät** stehen die passenden Wege für iPhone, iPad, Android, Mac und Windows. Falls der Browser eine native Installationsabfrage bereitstellt, erscheint dort **App installieren**. Andernfalls stehen die Schritte für das Browser-Menü zur Verfügung. Die Installation ist kostenlos.

| Gerät | Weg |
| --- | --- |
| iPhone und iPad | Safari öffnen, dann Teilen und Zum Home-Bildschirm |
| Android | In Chrome App installieren oder Zum Startbildschirm hinzufügen |
| Mac | Safari, Ablage und Zum Dock hinzufügen, oder die Installation in Chrome |
| Windows | Installation über Chrome oder Edge |

Die Verfügbarkeit hängt von der Browser- und Betriebssystemversion ab. Anmeldung, Laden der Bibliothek und das Speichern bei Supabase benötigen eine Internetverbindung. Das Manifest startet die öffentliche App-Adresse. Ein Freigabetoken oder OAuth-Code wird nicht als App-Identität gespeichert.

Die bestehende Architektur lädt neue Web-Versionen über HTTP. Für diese Online-Version wird kein Service Worker registriert. Die Installation speichert keine zusätzlichen Bibliotheks- oder Anmeldedaten in einem App-Cache.

Die Voraussetzungen für Browser-Installation wurden mit der aktuellen Manifest-Dokumentation abgeglichen. Safari unterstützt Web-Apps im Dock ab macOS Sonoma 14. [MDN zur Installation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [Apple zu Safari-Web-Apps](https://support.apple.com/en-ca/104996)

## Betrieb mit kostenlosen Angeboten

Die Anwendung verwendet Vite für statische Browser-Dateien und Supabase für Google-Anmeldung und die Bibliothek. Die normalen Lernfunktionen brauchen keine bezahlte KI-Schnittstelle oder Zahlungsabwicklung. Die Standardadresse bei Vercel benötigt keinen zusätzlich gekauften Domainnamen.

Vercel Hobby eignet sich gemäss den aktuellen Bedingungen für persönliche, nicht kommerzielle Nutzung. Supabase Free enthält gegenwärtig unter anderem 500 MB Datenbank, 1 GB Dateispeicher, 5 GB ausgehenden Datenverkehr und 50’000 monatlich aktive Nutzer. Die Nutzung muss innerhalb der jeweiligen Kontingente bleiben. Ein Supabase-Free-Projekt kann nach einer Woche geringer Aktivität pausieren und lässt sich im Dashboard wiederherstellen. Die Nutzungsgrenzen stehen in den beiden Dashboards. [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Supabase-Preise](https://supabase.com/pricing), [Supabase-Projektpausen](https://supabase.com/docs/guides/platform/free-project-pausing)

Die Online-Version hat keine Bezahlschranke. Stripe ist eine getrennte, optionale Spendenfunktion und für den Unterrichtsbetrieb keine Voraussetzung. An den gewählten Tarifen wurden durch die Vorbereitung der Installation keine Änderungen vorgenommen.

## Weg zu App Stores und nativen Downloads

Die Kartenformate, Lernlogik, Supabase-Tabellen und Freigabefunktionen bleiben als gemeinsame Grundlage nutzbar. Als nächster Schritt für veröffentlichte Downloads kommt ein natives Paket mit derselben Web-Oberfläche infrage. Capacitor unterstützt bestehende Web-Apps für iOS und Android. Tauri unterstützt unter anderem macOS und Windows. Die Auswahl erfolgt bei Beginn der nativen Version anhand der benötigten Gerätefunktionen. [Capacitor](https://capacitorjs.com/docs), [Tauri](https://v2.tauri.app/)

Für die native Version sind diese konkreten Anpassungen einzuplanen.

1. Google-Anmeldung im Systembrowser mit geprüftem Deep-Link-Rückweg zur App. Das aktuelle `auth.js` verwendet die Browser-Adresse für den OAuth-Rückweg.
2. Öffentliche Freigabelinks mit der bestehenden HTTPS-Domain. `library-sharing.mjs` verwendet heute die Browser-Domain und braucht für ein lokales App-Paket eine explizite öffentliche Basisadresse.
3. Eine explizite Backend-Adresse für die optionalen `/api`-Aufrufe. Die eingebauten Bibliothekszugriffe können denselben Supabase-Dienst weiterverwenden.
4. Native Builds, Signierung und Installation auf echten iOS-, Android-, macOS- und Windows-Geräten. Rückkehr aus dem Systembrowser, Aussprache und Dateiimport müssen dort geprüft werden.
5. Datenschutzhinweise, Kontolöschung und die dann gültigen Login- und Qualitätsvorgaben der Stores vervollständigen. Google-Login und Abmeldung sind im aktuellen Stand vorhanden. Die App muss die Prüfung durch den jeweiligen Store bestehen.

Supabase dokumentiert den OAuth-Rückweg für native Apps. Die Apple-Vorgaben betreffen unter anderem Kontolöschung, Login-Dienste und den Funktionsumfang. [Supabase Deep Links](https://supabase.com/docs/guides/auth/native-mobile-deep-linking), [Apple App Review](https://developer.apple.com/app-store/review/guidelines/)

Die Store-Veröffentlichung ist ein späterer eigener Schritt. Apple nennt aktuell 99 USD pro Mitgliedsjahr für das Developer Program. Google nennt 25 USD einmalig für die Play-Console-Registrierung. Regionale Beträge und die dann gültigen Bedingungen sind vor der Anmeldung zu prüfen. Native Entwicklerkonten, Signaturen und Store-Pakete sind derzeit nicht angelegt. [Apple-Mitgliedschaft](https://developer.apple.com/programs/whats-included/), [Google-Play-Registrierung](https://support.google.com/googleplay/android-developer/answer/6112435)

## Prüfung und Veröffentlichung

`npm test` prüft auch das Manifest, die echten PNG-Abmessungen und das Verhalten der Installationsabfrage bei Annahme, Ablehnung, Fehler und bereits installiertem Zustand. `npm run build` übernimmt Manifest und Symbole aus `public` in die veröffentlichbaren Dateien. Eine sichere lokale Vorschau wird über `npm run preview -- --host 127.0.0.1` geöffnet.

Vor einem Store-Release sind die nativen Pakete und echten Plattformtests erforderlich. Vor produktiven Datenbankänderungen bleibt die ausdrückliche Freigabe erforderlich. Die vorbereitete Migration für Aussprache-Einstellungen geteilter Kopien ist unabhängig von der Browser-Installation.
