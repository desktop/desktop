import { IConstrainedValue } from './app-state'

/**
 * Helper function to coerce a number into a valid range.
 *
 * Ensures that the returned value is at least min and at most (inclusive) max.
 */
export function clamp(value: number, min: number, max: number): number
export function clamp(value: IConstrainedValue): number
export function clamp(
  value: IConstrainedValue | number,
  max?: number,
  min?: number
): number {
  if (typeof value !== 'number') {
    return clamp(value.value, value.min, value.max)
  }

  // These condition could only occur at runtime if someone called
  // clamp(1234). That's pretty nonsensical so we'll assume that if
  // we're called without min/max we'll just be an identify function.
  min = min ?? -Infinity
  max = max ?? Infinity

  if (value < min) {
    return min
  } else if (value > max) {
    return max
  } else {
    return value
  }
}
