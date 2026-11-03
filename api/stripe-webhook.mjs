import { getStripe, json } from '../server/support-utils.mjs';

export async function POST(request) {
  const signature = request.headers.get('stripe-signature');
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!signature || !endpointSecret) {
    return json({ error: 'Stripe-Webhook ist nicht vollständig konfiguriert.' }, 400);
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch {
    return json({ error: 'Stripe ist noch nicht eingerichtet.' }, 503);
  }

  let rawBody;
  try {
    rawBody = await request.text();
  } catch {
    return json({ error: 'Webhook-Inhalt konnte nicht gelesen werden.' }, 400);
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, endpointSecret);
  } catch (error) {
    console.warn('Stripe-Webhook-Signatur ist ungültig.', error.name || 'SignatureVerificationError');
    return json({ error: 'Webhook-Signatur ungültig.' }, 400);
  }

  const supportedEvents = new Set([
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed',
    'checkout.session.expired'
  ]);
  if (supportedEvents.has(event.type)) {
    const session = event.data.object;
    const isWortwerkSupport = session.mode === 'payment' && session.metadata?.app === 'wortwerk' && session.metadata?.support === 'voluntary';
    if (isWortwerkSupport) {
      const confirmedPaid = event.type === 'checkout.session.async_payment_failed' || event.type === 'checkout.session.expired'
        ? false
        : session.payment_status === 'paid';
      // Keep no card or donor payment data in the app. Stripe remains the source
      // of truth; the return page retrieves the session directly from Stripe.
      console.info('Stripe support payment event verified.', { type: event.type, paid: confirmedPaid });
    }
  }

  return json({ received: true });
}

export function GET() {
  return json({ error: 'Diese Adresse unterstützt nur POST-Anfragen.' }, 405);
}
