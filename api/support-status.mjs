import { donationStatusFromStripeSession, isValidDonationAmountCents } from '../donation-values.mjs';
import { getAuthenticatedUser, getDonationEventStore, getStripe, json } from '../server/donation-utils.mjs';

function isWortwerkDonationSession(session, userId) {
  const newDonation = session.metadata?.purpose === 'voluntary_donation';
  const legacyDonation = session.metadata?.support === 'voluntary';
  return session.mode === 'payment' &&
    session.metadata?.app === 'wortwerk' &&
    (newDonation || legacyDonation) &&
    session.metadata?.user_id === userId &&
    session.client_reference_id === userId &&
    session.currency === 'chf' &&
    isValidDonationAmountCents(session.amount_total);
}

export function createDonationStatusHandler({ authenticate = getAuthenticatedUser, stripeClient = getStripe, eventStore = getDonationEventStore } = {}) {
  return async function GET(request) {
    const auth = await authenticate(request).catch(error => {
      console.error('Spendenstatus-Supabase-Authentifizierung fehlgeschlagen.', error.message);
      return { error: json({ error: 'Die sichere Zahlungsprüfung ist noch nicht vollständig konfiguriert.' }, 503) };
    });
    if (auth.error) return auth.error;

    const sessionId = new URL(request.url).searchParams.get('session_id') || '';
    if (!/^cs_(?:test_|live_)?[A-Za-z0-9]+$/.test(sessionId)) {
      return json({ error: 'Die Checkout-Referenz ist ungültig.' }, 400);
    }

    let stripe;
    try {
      stripe = stripeClient();
    } catch {
      return json({ error: 'Stripe ist noch nicht eingerichtet.' }, 503);
    }

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] });
      if (!isWortwerkDonationSession(session, auth.user.id)) {
        return json({ error: 'Diese Checkout-Session gehört nicht zu deinem Konto.' }, 403);
      }

      const paymentIntent = typeof session.payment_intent === 'string'
        ? await stripe.paymentIntents.retrieve(session.payment_intent)
        : session.payment_intent;
      const status = donationStatusFromStripeSession(session, paymentIntent);
      if (status !== 'paid') return json({ status });

      // A success screen requires both Stripe's current paid state and a matching,
      // signature-verified webhook record. A redirect alone can never confirm a gift.
      let supabase;
      try {
        supabase = eventStore();
      } catch {
        return json({ error: 'Die signierte Spendenbestätigung ist noch nicht vollständig konfiguriert.' }, 503);
      }
      const { data: confirmation, error } = await supabase
        .from('wortwerk_donation_events')
        .select('amount_total,currency')
        .eq('checkout_session_id', session.id)
        .eq('payment_status', 'paid')
        .order('received_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error('Signierte Spendenbestätigung konnte nicht gelesen werden.', error.code || 'DatabaseError');
        return json({ error: 'Die signierte Spendenbestätigung konnte gerade nicht geprüft werden.' }, 503);
      }
      if (!confirmation) return json({ status: 'pending' });
      if (confirmation.currency !== 'chf' || confirmation.amount_total !== session.amount_total) {
        console.error('Stripe- und Webhook-Spendenbetrag stimmen nicht überein.', { sessionId: session.id });
        return json({ error: 'Der Zahlungsbetrag konnte nicht eindeutig bestätigt werden.' }, 502);
      }

      return json({ status: 'paid', amountCents: session.amount_total, currency: 'chf' });
    } catch (error) {
      console.error('Stripe-Spendensession konnte nicht geprüft werden.', error.type || error.name || 'StripeError');
      return json({ error: 'Stripe konnte den Spendenstatus gerade nicht zurückgeben.' }, 502);
    }
  }
}

export const GET = createDonationStatusHandler();

export function POST() {
  return json({ error: 'Diese Adresse unterstützt nur GET-Anfragen.' }, 405);
}
