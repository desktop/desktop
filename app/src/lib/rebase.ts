import { clamp } from './clamp'

/**
 * Format rebase percentage to ensure it's a value between 0 and 1, but to also
 * constrain it to two significant figures, avoiding the remainder that comes
 * with floating point division.
 */
export function formatRebaseValue(value: number) {
  return Math.round(clamp(value, 0, 1) * 100) / 100
}
