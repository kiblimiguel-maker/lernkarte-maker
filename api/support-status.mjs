import { getAuthenticatedUser, getStripe, json } from '../server/support-utils.mjs';

export async function GET(request) {
  const auth = await getAuthenticatedUser(request).catch(error => {
    console.error('Support-Status Supabase-Authentifizierung fehlgeschlagen.', error.message);
    return { error: json({ error: 'Die sichere Zahlungsprüfung ist noch nicht vollständig konfiguriert.' }, 503) };
  });
  if (auth.error) return auth.error;

  const sessionId = new URL(request.url).searchParams.get('session_id') || '';
  if (!/^cs_(?:test_|live_)?[A-Za-z0-9]+$/.test(sessionId)) {
    return json({ error: 'Die Checkout-Referenz ist ungültig.' }, 400);
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch {
    return json({ error: 'Stripe ist noch nicht eingerichtet.' }, 503);
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] });
    if (
      session.mode !== 'payment' ||
      session.metadata?.app !== 'wortwerk' ||
      session.metadata?.support !== 'voluntary' ||
      session.metadata?.user_id !== auth.user.id ||
      session.client_reference_id !== auth.user.id ||
      session.currency !== 'chf' ||
      !Number.isInteger(session.amount_total) ||
      session.amount_total < 200 ||
      session.amount_total > 50000
    ) return json({ error: 'Diese Checkout-Session gehört nicht zu deinem Konto.' }, 403);

    const paymentIntent = typeof session.payment_intent === 'string'
      ? await stripe.paymentIntents.retrieve(session.payment_intent)
      : session.payment_intent;
    const status = session.payment_status === 'paid'
      ? 'paid'
      : session.status === 'expired' || paymentIntent?.status === 'canceled' || (session.status === 'complete' && paymentIntent?.status === 'requires_payment_method')
        ? 'failed'
        : 'pending';
    return json({ status });
  } catch (error) {
    console.error('Stripe Support-Session konnte nicht geprüft werden.', error.type || error.name || 'StripeError');
    return json({ error: 'Stripe konnte den Zahlungsstatus gerade nicht zurückgeben.' }, 502);
  }
}

export function POST() {
  return json({ error: 'Diese Adresse unterstützt nur GET-Anfragen.' }, 405);
}
