import { isDonationCheckoutConfigured, json } from '../server/donation-utils.mjs';

export { isDonationCheckoutConfigured };

export function GET() {
  return json({ configured: isDonationCheckoutConfigured() });
}

export function POST() {
  return json({ error: 'Diese Adresse unterstützt nur GET-Anfragen.' }, 405);
}
