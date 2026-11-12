/** Minimum horizontal travel, in CSS px, before a touch drag counts as a swipe. */
export const SWIPE_MIN_PX = 50;

/**
 * Map a finished touch drag to a photo step: swipe left for the next photo,
 * right for the previous one. The drag has to be mostly horizontal, so a
 * vertical scroll that drifts sideways doesn't change the photo.
 */
export function swipeStep(dx: number, dy: number, min = SWIPE_MIN_PX): 1 | -1 | 0 {
  if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}
