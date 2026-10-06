export const UNAVAILABLE_REASONS = [
  'Break Tea',
  'Lunch',
  'Consultation',
  'Meeting',
] as const;

export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number];

export function isUnavailableReason(value: unknown): value is UnavailableReason {
  return (
    typeof value === 'string' &&
    (UNAVAILABLE_REASONS as readonly string[]).includes(value)
  );
}
