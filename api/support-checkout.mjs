import { createDonationCheckoutIdempotencyKey, isValidDonationAmountCents } from '../donation-values.mjs';
import { getAuthenticatedUser, getStripe, isAllowedAppOrigin, json } from '../server/donation-utils.mjs';

function integrationIdentifier() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const suffix = Array.from(bytes, value => alphabet[value % alphabet.length]).join('');
  return `wortwerk_donation_${suffix}`;
}

export function createDonationCheckoutHandler({ authenticate = getAuthenticatedUser, stripeClient = getStripe, allowedOrigin = isAllowedAppOrigin } = {}) {
  return async function POST(request) {
    if (!allowedOrigin(request)) return json({ error: 'Diese Anfrage konnte nicht zugeordnet werden.' }, 403);

    const auth = await authenticate(request).catch(error => {
      console.error('Spenden-Checkout Supabase-Authentifizierung fehlgeschlagen.', error.message);
      return { error: json({ error: 'Die sichere Zahlungsprüfung ist noch nicht vollständig konfiguriert.' }, 503) };
    });
    if (auth.error) return auth.error;

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({ error: 'Bitte wähle einen gültigen Betrag.' }, 400);
    }
    const amountCents = payload?.amountCents;
    if (!isValidDonationAmountCents(amountCents)) {
      return json({ error: 'Bitte wähle einen gültigen Spendenbetrag zwischen CHF 0.50 und CHF 999’999.99.' }, 400);
    }
    const idempotencyKey = createDonationCheckoutIdempotencyKey(auth.user.id, payload?.requestId);
    if (!idempotencyKey) return json({ error: 'Die Spendenanfrage ist ungültig. Bitte versuche es erneut.' }, 400);

    let baseUrl;
    try {
      const configuredUrl = new URL(process.env.APP_BASE_URL || '');
      if (configuredUrl.protocol !== 'https:' && configuredUrl.hostname !== 'localhost') throw new Error('APP_BASE_URL must use HTTPS.');
      baseUrl = configuredUrl.origin;
    } catch (error) {
      console.error('APP_BASE_URL ist nicht korrekt konfiguriert.', error.message);
      return json({ error: 'Die Zahlungsseite ist noch nicht vollständig konfiguriert.' }, 503);
    }

    let stripe;
    try {
      stripe = stripeClient();
    } catch {
      return json({ error: 'Stripe ist noch nicht eingerichtet. Du kannst Lernkarten Maker weiterhin kostenlos nutzen.' }, 503);
    }

    try {
      const checkoutSession = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: 'chf',
            unit_amount: amountCents,
            product_data: {
              name: 'Freiwillige Spende für Lernkarten Maker',
              description: 'Einmalige Spende ohne Gegenleistung. Lernkarten Maker bleibt vollständig kostenlos.'
            }
          },
          quantity: 1
        }],
        client_reference_id: auth.user.id,
        metadata: { app: 'wortwerk', purpose: 'voluntary_donation', user_id: auth.user.id },
        success_url: `${baseUrl}/?donation=success&session_id={CHECKOUT_SESSION_ID}#donations`,
        cancel_url: `${baseUrl}/?donation=cancelled#donations`,
        integration_identifier: integrationIdentifier()
      }, { idempotencyKey });

      if (!checkoutSession.url) return json({ error: 'Stripe konnte keine Checkout-Seite bereitstellen. Bitte versuche es erneut.' }, 502);
      return json({ url: checkoutSession.url });
    } catch (error) {
      console.error('Stripe Checkout konnte nicht erstellt werden.', error.type || error.name || 'StripeError');
      return json({ error: 'Stripe konnte die Zahlung gerade nicht vorbereiten. Bitte versuche es später erneut.' }, 502);
    }
  }
}

export const POST = createDonationCheckoutHandler();

export function GET() {
  return json({ error: 'Diese Adresse unterstützt nur sichere POST-Anfragen.' }, 405);
}
