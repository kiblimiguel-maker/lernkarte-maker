import { getAuthenticatedUser, getStripe, isAllowedAppOrigin, json } from '../server/support-utils.mjs';

export async function POST(request) {
  if (!isAllowedAppOrigin(request)) return json({ error: 'Diese Anfrage konnte nicht zugeordnet werden.' }, 403);

  const auth = await getAuthenticatedUser(request).catch(error => {
    console.error('Support-Checkout Supabase-Authentifizierung fehlgeschlagen.', error.message);
    return { error: json({ error: 'Die sichere Zahlungsprüfung ist noch nicht vollständig konfiguriert.' }, 503) };
  });
  if (auth.error) return auth.error;

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Bitte wähle einen gültigen Betrag.' }, 400);
  }
  const amount = payload?.amount;
  if (!Number.isInteger(amount) || amount < 2 || amount > 500) {
    return json({ error: 'Der Betrag muss zwischen CHF 2 und CHF 500 liegen.' }, 400);
  }

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
    stripe = getStripe();
  } catch {
    return json({ error: 'Stripe ist noch nicht eingerichtet. Du kannst wortwerk weiterhin kostenlos nutzen.' }, 503);
  }

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'chf',
          unit_amount: amount * 100,
          product_data: { name: 'Freiwillige Unterstützung für Lernkarten Maker' }
        },
        quantity: 1
      }],
      client_reference_id: auth.user.id,
      metadata: { app: 'wortwerk', support: 'voluntary', user_id: auth.user.id },
      success_url: `${baseUrl}/?support=success&session_id={CHECKOUT_SESSION_ID}#support`,
      cancel_url: `${baseUrl}/?support=cancelled#support`
    }, { idempotencyKey: `wortwerk-support-${auth.user.id}-${crypto.randomUUID()}` });

    if (!checkoutSession.url) return json({ error: 'Stripe konnte keine Checkout-Seite bereitstellen. Bitte versuche es erneut.' }, 502);
    return json({ url: checkoutSession.url });
  } catch (error) {
    console.error('Stripe Checkout konnte nicht erstellt werden.', error.type || error.name || 'StripeError');
    return json({ error: 'Stripe konnte die Zahlung gerade nicht vorbereiten. Bitte versuche es später erneut.' }, 502);
  }
}

export function GET() {
  return json({ error: 'Diese Adresse unterstützt nur sichere POST-Anfragen.' }, 405);
}
