import assert from 'node:assert/strict';
import {
  DONATION_MAX_CENTS,
  DONATION_MIN_CENTS,
  DONATION_PRESETS_CENTS,
  DONATION_REMINDER_INTERVAL_MS,
  classifyDonationWebhookEvent,
  createDonationCheckoutIdempotencyKey,
  donationStatusFromStripeSession,
  formatDonationAmount,
  isValidDonationAmountCents,
  markDonationWelcomeShown,
  parseDonationAmountCents,
  persistDonationEventOnce,
  setDonationReminderEnabled,
  shouldShowDonationWelcome
} from './donation-values.mjs';
import { createStripeWebhookHandler } from './api/stripe-webhook.mjs';
import { POST as createCheckout, createDonationCheckoutHandler } from './api/support-checkout.mjs';
import { GET as checkDonationStatus, createDonationStatusHandler } from './api/support-status.mjs';

assert.deepEqual(DONATION_PRESETS_CENTS, [500, 1000, 2000]);
assert.equal(parseDonationAmountCents('0.50'), 50);
assert.equal(parseDonationAmountCents('12,5'), 1250);
assert.equal(parseDonationAmountCents('999999.99'), DONATION_MAX_CENTS);
assert.equal(parseDonationAmountCents('0.49'), null);
assert.equal(parseDonationAmountCents('1000000'), null);
assert.equal(parseDonationAmountCents('1.001'), null);
assert.equal(parseDonationAmountCents('CHF 5'), null);
assert.equal(isValidDonationAmountCents(DONATION_MIN_CENTS), true);
assert.equal(isValidDonationAmountCents(DONATION_MAX_CENTS), true);
assert.equal(isValidDonationAmountCents(49), false);
assert.equal(formatDonationAmount(500).includes('5'), true);

const userId = '8aebee4d-9883-44a4-bb13-70c126bf07b0';
const requestA = 'd13ebd31-3d77-40c3-9aeb-a14e0d35cb48';
const requestB = '774dcbce-2627-40c6-8ef9-b0050a35f9f2';
assert.equal(createDonationCheckoutIdempotencyKey(userId, requestA), createDonationCheckoutIdempotencyKey(userId, requestA));
assert.notEqual(createDonationCheckoutIdempotencyKey(userId, requestA), createDonationCheckoutIdempotencyKey(userId, requestB));
assert.equal(createDonationCheckoutIdempotencyKey(userId, 'bad'), null);

const storageMap = new Map();
const storage = {
  getItem: key => storageMap.get(key) ?? null,
  setItem: (key, value) => storageMap.set(key, value),
  removeItem: key => storageMap.delete(key)
};
assert.equal(shouldShowDonationWelcome(storage, 1_000_000), true);
markDonationWelcomeShown(storage, 1_000_000);
assert.equal(shouldShowDonationWelcome(storage, 1_000_001), false);
assert.equal(shouldShowDonationWelcome(storage, 1_000_000 + DONATION_REMINDER_INTERVAL_MS), true);
setDonationReminderEnabled(false, storage);
assert.equal(shouldShowDonationWelcome(storage, 1_000_000 + 2 * DONATION_REMINDER_INTERVAL_MS), false);
setDonationReminderEnabled(true, storage);
assert.equal(shouldShowDonationWelcome(storage, 1_000_001), true);

const session = {
  object: 'checkout.session',
  id: 'cs_test_donation123',
  mode: 'payment',
  status: 'complete',
  payment_status: 'paid',
  currency: 'chf',
  amount_total: 1250,
  metadata: { app: 'wortwerk', purpose: 'voluntary_donation' }
};
const event = (type, object = session, id = `evt_${type.replaceAll('.', '_')}`) => ({ id, type, data: { object } });
assert.equal(classifyDonationWebhookEvent(event('checkout.session.completed')).payment_status, 'paid');
assert.equal(classifyDonationWebhookEvent(event('checkout.session.completed', { ...session, payment_status: 'unpaid' })).payment_status, 'pending');
assert.equal(classifyDonationWebhookEvent(event('checkout.session.async_payment_succeeded')).payment_status, 'paid');
assert.equal(classifyDonationWebhookEvent(event('checkout.session.async_payment_failed')).payment_status, 'failed');
assert.equal(classifyDonationWebhookEvent(event('checkout.session.expired', { ...session, amount_total: null })).payment_status, 'expired');
assert.equal(classifyDonationWebhookEvent(event('checkout.session.completed', { ...session, mode: 'subscription' })), null);
assert.equal(classifyDonationWebhookEvent(event('checkout.session.completed', { ...session, amount_total: 49 })), null);
assert.equal(classifyDonationWebhookEvent(event('checkout.session.completed', { ...session, metadata: { app: 'wortwerk', purpose: 'not-a-donation' } })), null);
assert.equal(donationStatusFromStripeSession({ ...session, status: 'expired' }), 'expired');
assert.equal(donationStatusFromStripeSession({ ...session, status: 'open', payment_status: 'unpaid' }, { status: 'requires_payment_method', last_payment_error: {} }), 'failed');
assert.equal(donationStatusFromStripeSession({ ...session, payment_status: 'unpaid' }), 'pending');

const eventStore = new Set();
const ledgerRecord = classifyDonationWebhookEvent(event('checkout.session.completed'));
const firstInsert = await persistDonationEventOnce(ledgerRecord, async record => eventStore.add(record.event_id));
const duplicateInsert = await persistDonationEventOnce(ledgerRecord, async record => {
  if (eventStore.has(record.event_id)) throw Object.assign(new Error('duplicate'), { code: '23505' });
  eventStore.add(record.event_id);
});
assert.deepEqual(firstInsert, { recorded: true, duplicate: false });
assert.deepEqual(duplicateInsert, { recorded: true, duplicate: true });

process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_value';
const webhookEvents = [event('checkout.session.completed')];
const verifiedStripe = { webhooks: { constructEvent: () => webhookEvents[0] } };
const persisted = new Set();
const webhookHandler = createStripeWebhookHandler({
  getStripeClient: () => verifiedStripe,
  persistEvent: async record => {
    if (persisted.has(record.event_id)) throw Object.assign(new Error('duplicate'), { code: '23505' });
    persisted.add(record.event_id);
  }
});
const webhookRequest = () => new Request('https://wortwerk.test/api/stripe-webhook', {
  method: 'POST', headers: { 'stripe-signature': 'valid-signature' }, body: '{}'
});
const firstWebhookResponse = await webhookHandler(webhookRequest());
const duplicateWebhookResponse = await webhookHandler(webhookRequest());
assert.equal(firstWebhookResponse.status, 200);
assert.deepEqual(await firstWebhookResponse.json(), { received: true, duplicate: false });
assert.equal(duplicateWebhookResponse.status, 200);
assert.deepEqual(await duplicateWebhookResponse.json(), { received: true, duplicate: true });

const invalidStripe = { webhooks: { constructEvent: () => { throw new Error('invalid signature'); } } };
const invalidHandler = createStripeWebhookHandler({ getStripeClient: () => invalidStripe, persistEvent: async () => assert.fail('invalid event must not be persisted') });
assert.equal((await invalidHandler(webhookRequest())).status, 400);

process.env.APP_BASE_URL = 'https://lernkarte-maker.vercel.app';
const anonymousCheckout = await createCheckout(new Request('https://lernkarte-maker.vercel.app/api/support-checkout', {
  method: 'POST', headers: { origin: 'https://lernkarte-maker.vercel.app', 'content-type': 'application/json' },
  body: JSON.stringify({ amountCents: 500, requestId: requestA })
}));
assert.equal(anonymousCheckout.status, 401, 'checkout without a signed-in user is clearly rejected');

const checkoutCalls = [];
const checkoutHandler = createDonationCheckoutHandler({
  authenticate: async () => ({ user: { id: userId } }),
  allowedOrigin: () => true,
  stripeClient: () => ({ checkout: { sessions: { create: async (params, options) => {
    checkoutCalls.push({ params, options });
    return { url: 'https://checkout.stripe.com/c/pay_test' };
  } } } })
});
const checkoutRequest = (amountCents, requestId) => new Request('https://lernkarte-maker.vercel.app/api/support-checkout', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ amountCents, requestId })
});
const presetCheckoutResponse = await checkoutHandler(checkoutRequest(500, requestA));
assert.equal(presetCheckoutResponse.status, 200);
assert.equal((await presetCheckoutResponse.json()).url, 'https://checkout.stripe.com/c/pay_test');
assert.equal(checkoutCalls[0].params.mode, 'payment', 'donations create one-time Checkout sessions');
assert.equal(checkoutCalls[0].params.line_items[0].price_data.currency, 'chf');
assert.equal(checkoutCalls[0].params.line_items[0].price_data.unit_amount, 500);
assert.equal(checkoutCalls[0].params.metadata.purpose, 'voluntary_donation');
assert.match(checkoutCalls[0].params.success_url, /donation=success/);
assert.match(checkoutCalls[0].params.cancel_url, /donation=cancelled/);
assert.match(checkoutCalls[0].params.integration_identifier, /^wortwerk_donation_[A-Za-z]{8}$/);
assert.equal(checkoutCalls[0].options.idempotencyKey, createDonationCheckoutIdempotencyKey(userId, requestA));
await checkoutHandler(checkoutRequest(500, requestA));
await checkoutHandler(checkoutRequest(1000, requestB));
assert.equal(checkoutCalls[1].options.idempotencyKey, checkoutCalls[0].options.idempotencyKey, 'retries reuse the request idempotency key');
assert.notEqual(checkoutCalls[2].options.idempotencyKey, checkoutCalls[0].options.idempotencyKey, 'a later donation gets a separate Checkout session');
assert.equal(checkoutCalls[2].params.line_items[0].price_data.unit_amount, 1000);
const invalidAmountResponse = await checkoutHandler(checkoutRequest(49, requestA));
assert.equal(invalidAmountResponse.status, 400);
assert.equal(checkoutCalls.length, 3, 'invalid amounts never reach Stripe');

const paidOwnedSession = {
  ...session,
  client_reference_id: userId,
  metadata: { app: 'wortwerk', purpose: 'voluntary_donation', user_id: userId },
  payment_intent: { status: 'succeeded' }
};
let ledgerConfirmation = { amount_total: 1250, currency: 'chf' };
let statusSession = paidOwnedSession;
const statusHandler = createDonationStatusHandler({
  authenticate: async () => ({ user: { id: userId } }),
  stripeClient: () => ({ checkout: { sessions: { retrieve: async () => statusSession } } }),
  eventStore: () => ({ from: () => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: () => query,
      maybeSingle: async () => ({ data: ledgerConfirmation, error: null })
    };
    return query;
  } })
});
const statusRequest = () => new Request('https://lernkarte-maker.vercel.app/api/support-status?session_id=cs_test_donation123');
const successfulStatus = await statusHandler(statusRequest());
assert.equal(successfulStatus.status, 200);
assert.deepEqual(await successfulStatus.json(), { status: 'paid', amountCents: 1250, currency: 'chf' });
ledgerConfirmation = null;
assert.deepEqual(await (await statusHandler(statusRequest())).json(), { status: 'pending' }, 'a Stripe success redirect without a verified webhook is not confirmed');
ledgerConfirmation = { amount_total: 1000, currency: 'chf' };
assert.equal((await statusHandler(statusRequest())).status, 502, 'a mismatched webhook amount is rejected');
ledgerConfirmation = { amount_total: 1250, currency: 'chf' };
statusSession = { ...paidOwnedSession, client_reference_id: 'another-user' };
assert.equal((await statusHandler(statusRequest())).status, 403, 'a session from another user cannot be inspected');
statusSession = { ...paidOwnedSession, status: 'open', payment_status: 'unpaid', payment_intent: { status: 'requires_payment_method', last_payment_error: {} } };
assert.deepEqual(await (await statusHandler(statusRequest())).json(), { status: 'failed' });
statusSession = { ...paidOwnedSession, status: 'expired' };
assert.deepEqual(await (await statusHandler(statusRequest())).json(), { status: 'expired' });
assert.equal((await statusHandler(new Request('https://lernkarte-maker.vercel.app/api/support-status?session_id=invalid'))).status, 400);
assert.equal((await checkDonationStatus(new Request('https://lernkarte-maker.vercel.app/api/support-status?session_id=cs_test_donation123'))).status, 401);

console.log('donation.test.mjs passed');
