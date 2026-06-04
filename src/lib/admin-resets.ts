// Single source of truth for password-reset TTLs, shared between
// the admin page (decides which rows are still actionable) and the
// completePasswordReset server action (decides which rows can still
// be cashed in for a new password). Keep these in lockstep — if the
// page says "Expired" but the server still accepts the reset, that's
// a confusing UX bug, and vice versa.

// Pending: the user submitted but Mark hasn't acted yet. After this
// elapses we stop treating the row as actionable and put it under
// "Expired" so the queue stays clean.
export const PENDING_EXPIRY_MS = 30 * 60 * 1000;

// Approved-but-unfulfilled: Mark clicked Approve but the user never
// set a new password. Same idea — after this elapses we shelf the row
// and the server rejects late completion attempts.
export const APPROVAL_EXPIRY_MS = 30 * 60 * 1000;
