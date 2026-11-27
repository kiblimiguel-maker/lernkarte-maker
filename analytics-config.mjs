// Public configuration, never credentials. None of these switches is a consent.
// Keep disabled until the operator has completed LEGAL_SETUP.md and documented
// the legal/contractual basis for every eligible visitor, including minors.
export const analyticsConfig = Object.freeze({
  enabled: false,
  legalApproved: false,
  minorsEligibilityVerified: false,
  enhancedMeasurementVerifiedDisabled: false,
  advertisingAndSharingVerifiedDisabled: false,
  measurementId: 'G-LW1QZY0HMD',
  streamId: '16413316024',
  streamName: 'Lernkarten App Web',
  productionOrigins: Object.freeze(['https://lernkarte-maker.vercel.app']),
  consentVersion: '2026-11-27.1',
  // Reported in the GA4 property. Update when confirming the final settings.
  retention: Object.freeze({ eventMonths: 14, userMonths: 14, resetUserOnActivity: true }),
  // Project limits for a future release. These do not authorize GA4.
  // Persistent analytics cookies are limited by the remaining consent lifetime.
  cookieExpiresSeconds: 180 * 86_400,
  consentMaxAgeDays: 180
});
