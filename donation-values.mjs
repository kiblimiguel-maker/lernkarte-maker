export const DONATION_MIN_CENTS = 50;
export const DONATION_MAX_CENTS = 99_999_999;
export const DONATION_PRESETS_CENTS = Object.freeze([500, 1000, 2000]);
export const DONATION_REMINDER_ENABLED_KEY = 'wortwerk-donation-reminder-enabled-v1';
export const DONATION_REMINDER_LAST_SHOWN_KEY = 'wortwerk-donation-reminder-last-shown-v1';
export const DONATION_REMINDER_INTERVAL_MS = 90 * 24 * 60 * 60 * 1000;

function defaultDonationStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function isDonationReminderEnabled(storage) {
  storage ??= defaultDonationStorage();
  try {
    return storage?.getItem(DONATION_REMINDER_ENABLED_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setDonationReminderEnabled(enabled, storage) {
  storage ??= defaultDonationStorage();
  if (!storage) return false;
  try {
    storage?.setItem(DONATION_REMINDER_ENABLED_KEY, String(Boolean(enabled)));
    if (enabled) storage?.removeItem(DONATION_REMINDER_LAST_SHOWN_KEY);
    return true;
  } catch {
    return false;
  }
}

export function shouldShowDonationWelcome(storage, now = Date.now()) {
  storage ??= defaultDonationStorage();
  if (!isDonationReminderEnabled(storage)) return false;
  if (!storage) return false;
  try {
    const lastShown = Number(storage?.getItem(DONATION_REMINDER_LAST_SHOWN_KEY));
    return !Number.isFinite(lastShown) || lastShown <= 0 || now - lastShown >= DONATION_REMINDER_INTERVAL_MS;
  } catch {
    return false;
  }
}

export function markDonationWelcomeShown(storage, now = Date.now()) {
  storage ??= defaultDonationStorage();
  if (!storage) return false;
  try {
    storage?.setItem(DONATION_REMINDER_LAST_SHOWN_KEY, String(now));
    return true;
  } catch {
    return false;
  }
}

export function isValidDonationAmountCents(value) {
  return Number.isSafeInteger(value) && value >= DONATION_MIN_CENTS && value <= DONATION_MAX_CENTS;
}

export function parseDonationAmountCents(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;

  const [whole, fraction = ''] = normalized.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return isValidDonationAmountCents(cents) ? cents : null;
}

export function formatDonationAmount(cents, locale = 'de-CH') {
  if (!Number.isSafeInteger(cents) || cents < 0) return '';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'CHF',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(cents / 100);
}

export function donationStatusFromStripeSession(session, paymentIntent) {
  if (session?.status === 'expired') return 'expired';
  if (session?.status === 'complete' && session.payment_status === 'paid') return 'paid';
  if (paymentIntent?.status === 'canceled' || (paymentIntent?.status === 'requires_payment_method' && paymentIntent?.last_payment_error)) return 'failed';
  return 'pending';
}

const DONATION_EVENT_STATUSES = new Map([
  ['checkout.session.completed', session => session.payment_status === 'paid' ? 'paid' : 'pending'],
  ['checkout.session.async_payment_succeeded', session => session.payment_status === 'paid' ? 'paid' : null],
  ['checkout.session.async_payment_failed', () => 'failed'],
  ['checkout.session.expired', () => 'expired']
]);

export function classifyDonationWebhookEvent(event) {
  if (!event?.id || !event.id.startsWith('evt_')) return null;
  const getStatus = DONATION_EVENT_STATUSES.get(event.type);
  if (!getStatus) return null;

  const session = event.data?.object;
  const purpose = session?.metadata?.purpose === 'voluntary_donation' || session?.metadata?.support === 'voluntary';
  if (
    session?.object !== 'checkout.session' ||
    session.mode !== 'payment' ||
    session.metadata?.app !== 'wortwerk' ||
    !purpose ||
    !session.id?.startsWith('cs_') ||
    session.currency !== 'chf'
  ) return null;

  const amountCents = session.amount_total;
  const isExpiredWithoutAmount = event.type === 'checkout.session.expired' && amountCents == null;
  if (!isExpiredWithoutAmount && !isValidDonationAmountCents(amountCents)) return null;
  const status = getStatus(session);
  if (!status) return null;

  return {
    event_id: event.id,
    checkout_session_id: session.id,
    event_type: event.type,
    payment_status: status,
    amount_total: isExpiredWithoutAmount ? null : amountCents,
    currency: 'chf'
  };
}

export function createDonationCheckoutIdempotencyKey(userId, requestId) {
  if (typeof userId !== 'string' || !userId || !/^[0-9a-f-]{36}$/i.test(String(requestId || ''))) return null;
  return `wortwerk-donation-${userId}-${requestId}`;
}

export async function persistDonationEventOnce(record, persist) {
  try {
    await persist(record);
    return { recorded: true, duplicate: false };
  } catch (error) {
    if (error?.code === '23505' || error?.status === 409) return { recorded: true, duplicate: true };
    throw error;
  }
}
