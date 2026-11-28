import { contactEmail } from './legal-config.mjs';

export const vercelWebAnalyticsNotice = {
  title: 'Freiwillige Besuchsstatistik',
  paragraphs: [
    'Wenn du «Statistik erlauben» wählst, kann die veröffentlichte Website einen allgemeinen Aufruf der App an Vercel Web Analytics melden. So lässt sich die Nutzung der App in zusammengefassten Zahlen einschätzen. Pro Laden der App wird höchstens ein Aufruf erfasst. Die Auswahl ist freiwillig und alle Lernfunktionen sind auch ohne Statistik verfügbar.',
    'Vercel verarbeitet dafür technische Angaben wie den Zeitpunkt, den ungefähren Standort sowie Browser- und Gerätedaten. Vercel Web Analytics setzt keine Analyse-Cookies. Eine aus der Anfrage berechnete Kennung unterscheidet Besuche innerhalb eines Tages. Bei einem direkten Verweis von einer anderen Website kann Vercel die Adresse ihrer Startseite erhalten. Besuche mit privaten Linkangaben oder zusätzlichen URL-Parametern bleiben ebenso wie Konto- und Lerndaten und einzelne App-Aktionen ausserhalb der Statistik. Vercel kann Daten in den USA und an weiteren Bearbeitungsorten verarbeiten.',
    'Die App merkt sich deine Auswahl in einem eigenen Cookie für höchstens 180 Tage. Wählst du «Nur notwendige», siehst du beim nächsten Öffnen der Startseite einen schliessbaren Hinweis. Nach deiner Zustimmung speichert die App im Browser zusätzlich, dass der Banner ausgeblendet bleiben soll. Diese Anzeigeeinstellung enthält keine Kennung und erteilt keine Einwilligung. Nach 180 Tagen endet die Messung. Unter «Rechtliches → Cookie-Einstellungen» kannst du die Statistik jederzeit erneut erlauben oder deine Zustimmung widerrufen.'
  ],
  links: [
    { title: 'Vercel zu Datenschutz bei Web Analytics', url: 'https://vercel.com/docs/analytics/privacy-policy' },
    { title: 'Vercel zu Datenbearbeitung und Auslandübermittlungen', url: 'https://vercel.com/legal/dpa' }
  ]
};

export function publicLegalNotice(page, config) {
  const support = contactEmail(config.supportEmail);
  const privacy = contactEmail(config.privacyEmail) || support;

  if (page === 'privacy') return {
    title: 'Informationen zum Datenschutz',
    status: 'Hier findest du die bestätigten Angaben zur aktuellen Datenverarbeitung. Die vollständige Datenschutzerklärung ist noch nicht freigegeben.',
    email: privacy,
    sections: [
      {
        title: 'Anmeldung und Bibliothek',
        paragraphs: [
          'Die Anmeldung läuft über Google und Supabase Auth. Für die Anmeldung und die Zuordnung deiner Bibliothek verarbeitet die App deine E-Mail-Adresse und eine interne Kontokennung.',
          `Supabase speichert deine Fächer, Ordner, Lernstapel, Karten, Tests und Lernfortschritte für dein Konto, damit du auf verschiedenen Geräten weiterlernen kannst. Die primäre Datenbank befindet sich in ${config.processing.supabaseRegion}.`
        ]
      },
      {
        title: 'Website und Browserspeicher',
        paragraphs: [
          'Vercel stellt die Website bereit. Beim Aufruf der App und ihrer Dienste fallen technische Verbindungsdaten wie IP-Adresse und Zeitpunkt an. Vercel nennt die USA als primären Ort seiner Datenbearbeitung. Supabase nennt neben der gewählten Datenbankregion Singapur und die USA für bestimmte Betriebs- und Supportaufgaben.',
          'Die App nutzt den Browserspeicher für die Sitzung, Einstellungen und die Wiederherstellung ausstehender Änderungen. Wenn du uns per E-Mail kontaktierst, werden Adresse und Nachricht im Gmail-Postfach bearbeitet. Google betreibt für seine Dienste weltweit Server.'
        ]
      },
      {
        title: 'Geteilte Lerninhalte',
        paragraphs: [
          'Personen mit einem Freigabelink können die Vorschau öffnen und die freigegebenen Inhalte nach Anmeldung als eigene Kopie übernehmen. Importierte Kopien bleiben unabhängig. Ein Testlink verweist auf den Stand zum Zeitpunkt der Freigabe und kann auch nach dem Löschen des ursprünglichen Tests noch funktionieren.',
          'Links zu Unterlagen werden als Webadressen gespeichert. Beim Öffnen gelangst du zum jeweiligen Anbieter. Die Aussprachefunktion verwendet französische Stimmen, die dein Browser als lokal kennzeichnet.'
        ]
      },
      vercelWebAnalyticsNotice,
      {
        title: 'Google Analytics 4',
        paragraphs: ['Google Analytics 4 ist ausgeschaltet. Die App lädt dafür kein Skript und setzt keine Google-Analytics-Cookies.']
      },
      {
        title: 'Auskunft, Berichtigung und Löschung',
        paragraphs: [
          'Über den Datenschutzkontakt kannst du Auskunft über deine Daten, eine Berichtigung, eine Datenherausgabe oder die Löschung deines Kontos anfragen. Sende dabei keine Passwörter oder Zugangscodes.'
        ]
      }
    ]
  };

  if (page === 'terms') return {
    title: 'Nutzungsregeln',
    status: 'Diese Regeln gelten für den sorgfältigen Umgang mit Lerninhalten. Die vollständigen AGB sind noch nicht freigegeben.',
    email: support,
    sections: [
      {
        title: 'Kostenlos lernen',
        paragraphs: [
          'Mit Lernkarten Maker kannst du Lernkarten erstellen, lernen und teilen. Prüfe wichtige Lerninhalte anhand deiner Unterrichtsunterlagen oder anderer verlässlicher Quellen.'
        ]
      },
      {
        title: 'Inhalte erstellen und teilen',
        paragraphs: [
          'Teile nur Inhalte, die du weitergeben darfst. Beachte das Urheberrecht und die Privatsphäre anderer. Unterlasse rechtswidrige Inhalte, Spam und den Missbrauch von Freigaben.',
          'Ein Freigabelink kann weitergegeben werden. Prüfe die Inhalte vor dem Teilen. Wer einen Lernstapel oder Test importiert, erhält eine eigene Kopie. Änderungen am Original wirken sich auf diese Kopie nicht aus.'
        ]
      },
      {
        title: 'Probleme melden',
        paragraphs: [
          'Melde problematische freigegebene Inhalte über «Inhalt melden» oder per E-Mail. Gib den betreffenden Link und den Grund deiner Meldung an.'
        ]
      }
    ]
  };

  return {
    title: 'Anbieter und Kontakt',
    status: 'Hier findest du die öffentlichen Projektangaben. Das vollständige Impressum ist noch nicht freigegeben.',
    email: support,
    sections: [{
      title: config.appName,
      paragraphs: [config.description, `Projektkontakt ${config.operator.name} · ${config.country}`]
    }]
  };
}
