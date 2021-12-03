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
  min = -Infinity,
  max = Infinity
): number {
  if (typeof value !== 'number') {
    return clamp(value.value, value.min, value.max)
  }

  if (value < min) {
    return min
  } else if (value > max) {
    return max
  } else {
    return value
  }
}
