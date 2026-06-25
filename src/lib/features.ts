// Small, intentional kill-switches for features that are built but
// not currently advertised. Flip a flag to bring the UI back without
// hunting through component code.
//
// The plumbing (server actions, admin pages, banner, etc) for any
// flagged-off feature is intentionally left in place so re-enabling
// is a single boolean change.

export const FEATURES = {
  // The admin-mediated password reset (/forgot-password →
  // /admin/resets approval → user sets new password) works, but is
  // hidden from the sign-in screen by default. Set this to true to
  // surface the "Forgot password?" link again. The admin tools
  // (banner on /, link in AppHeader, /admin/resets page) keep
  // working regardless so Mark can still service direct requests.
  showForgotPasswordLink: true,
} as const;
