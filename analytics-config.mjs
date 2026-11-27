// Public configuration, never credentials. None of these switches is a consent.
// Keep disabled until the contracted use, tag settings and adult pilot have
// been approved. Each account and browser still have their own consent gates.
export const analyticsConfig = Object.freeze({
  enabled: false,
  releaseApproved: false,
  measurementId: 'G-LW1QZY0HMD',
  streamId: '16413316024',
  streamName: 'Lernkarten App Web',
  productionOrigins: Object.freeze(['https://lernkarte-maker.vercel.app']),
  consentVersion: '2026-11-27.1',
  // Confirmed for this GA4 property on 27 November 2026.
  retention: Object.freeze({ eventMonths: 14, userMonths: 14, resetUserOnActivity: true }),
  // Project limits for a future release. These do not authorize GA4.
  // Persistent analytics cookies are limited by the remaining consent lifetime.
  cookieExpiresSeconds: 180 * 86_400,
  consentMaxAgeDays: 180
});
