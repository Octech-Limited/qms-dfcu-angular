export const HOLD_REASONS = [
  'Waiting for ID / documents',
  'Customer stepped away',
  'Awaiting supervisor approval',
  'System / core banking issue',
  'Cash or till issue',
  'Need more information from customer',
] as const;

export type HoldReason = (typeof HOLD_REASONS)[number];
