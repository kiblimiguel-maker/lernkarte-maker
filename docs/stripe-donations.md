# Spenden mit Stripe aktivieren

Lernkarten Maker bleibt für alle kostenlos. Checkout erzeugt ausschliesslich einzelne Zahlungen in CHF; es gibt keine Abos oder zahlungspflichtigen Funktionen.

## Vercel

Lege diese Variablen für **Production** im Vercel-Projekt `lernkarte-maker` an:

- `STRIPE_SECRET_KEY`: geheimer Stripe-Schlüssel im Live-Modus (`sk_live_…`).
- `STRIPE_WEBHOOK_SECRET`: Signaturgeheimnis des unten angelegten Live-Webhook-Endpunkts (`whsec_…`).
- `SUPABASE_SECRET_KEY`: serverseitiger Supabase-Schlüssel, der die Tabelle `wortwerk_donation_events` lesen und beschreiben darf. Ein Supabase-`service_role`-Schlüssel kann stattdessen unter `SUPABASE_SERVICE_ROLE_KEY` gesetzt werden. Beide bleiben ausschliesslich serverseitig.
- `APP_BASE_URL`: `https://lernkarte-maker.vercel.app`.

Stripe- und Supabase-Servergeheimnisse dürfen niemals als `VITE_…`-Variablen angelegt werden. Nach dem Eintragen der Variablen Production neu deployen.

## Stripe-Webhook

Lege im Stripe-Dashboard im **Live-Modus** einen Webhook an:

- URL: `https://lernkarte-maker.vercel.app/api/stripe-webhook`
- Ereignisse: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`

Das dort angezeigte Signaturgeheimnis kommt in `STRIPE_WEBHOOK_SECRET`. Die Webhook-Adresse akzeptiert nur signierte Stripe-Anfragen. Ereignis-IDs werden in Supabase eindeutig gespeichert; Wiederholungen derselben Nachricht erzeugen keinen zweiten Eintrag. Die Bestätigungsseite zeigt eine Spende erst, wenn sowohl der aktuelle Stripe-Status als auch ein passender, signaturgeprüfter Webhook-Eintrag den tatsächlichen CHF-Betrag bestätigen.

## Schweiz und Freigabe

Schliesse das Stripe-Geschäftskonto-Onboarding ab und hinterlege das gewünschte Auszahlungskonto in der Schweiz. Prüfe im Dashboard, dass das Konto Zahlungen und Auszahlungen in CHF unterstützt. Verwende erst danach Live-Schlüssel und den Live-Webhook. Bis diese Werte gesetzt sind, lehnt die API Zahlungen geschlossen ab; die übrige App bleibt davon unberührt.

Der freie Betrag wird serverseitig in Rappen geprüft. Die zulässigen CHF-Betragsgrenzen richten sich nach Stripe; für CHF beträgt das Minimum CHF 0.50 und das Maximum CHF 999'999.99. Siehe [Stripe: Supported currencies](https://docs.stripe.com/currencies).
