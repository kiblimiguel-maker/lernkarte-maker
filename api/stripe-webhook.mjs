import { classifyDonationWebhookEvent, persistDonationEventOnce } from '../donation-values.mjs';
import { getDonationEventStore, getStripe, json } from '../server/donation-utils.mjs';

const HANDLED_DONATION_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired'
]);

function isWortwerkDonationEvent(event) {
  const session = event?.data?.object;
  return session?.metadata?.app === 'wortwerk' &&
    (session.metadata?.purpose === 'voluntary_donation' || session.metadata?.support === 'voluntary');
}

export function createStripeWebhookHandler({ getStripeClient = getStripe, persistEvent } = {}) {
  return async function POST(request) {
    const signature = request.headers.get('stripe-signature');
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!signature || !endpointSecret) {
      return json({ error: 'Stripe-Webhook ist nicht vollständig konfiguriert.' }, 400);
    }

    let stripe;
    try {
      stripe = getStripeClient();
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

    if (!HANDLED_DONATION_EVENTS.has(event.type) || !isWortwerkDonationEvent(event)) {
      return json({ received: true, ignored: true });
    }

    const record = classifyDonationWebhookEvent(event);
    if (!record) {
      console.error('Stripe-Spendenereignis hatte ungültige Zahlungsdaten.', { type: event.type, eventId: event.id });
      return json({ error: 'Das Spendenereignis enthält ungültige Zahlungsdaten.' }, 400);
    }

    try {
      const result = await persistDonationEventOnce(record, async donationEvent => {
        if (persistEvent) return persistEvent(donationEvent);
        const supabase = getDonationEventStore();
        const { error } = await supabase.from('wortwerk_donation_events').insert(donationEvent);
        if (error) throw error;
      });
      return json({ received: true, duplicate: result.duplicate });
    } catch (error) {
      console.error('Verifiziertes Stripe-Spendenereignis konnte nicht gespeichert werden.', error.code || error.name || 'DatabaseError');
      return json({ error: 'Das verifizierte Spendenereignis konnte nicht dauerhaft gespeichert werden.' }, 503);
    }
  };
}

export const POST = createStripeWebhookHandler();

export function GET() {
  return json({ error: 'Diese Adresse unterstützt nur POST-Anfragen.' }, 405);
}
