import { assertNever } from './fatal-error'

type Unit = 'year' | 'day' | 'hour' | 'minute' | 'second'

export function toMilliseconds(value: number, unit: Unit | `${Unit}s`): number {
  switch (unit) {
    case 'year':
    case 'years':
      return value * 1000 * 60 * 60 * 24 * 365
    case 'day':
    case 'days':
      return value * 1000 * 60 * 60 * 24
    case 'hour':
    case 'hours':
      return value * 1000 * 60 * 60
    case 'minute':
    case 'minutes':
      return value * 1000 * 60
    case 'second':
    case 'seconds':
      return value * 1000
    default:
      assertNever(unit, `Unknown time unit ${unit}`)
  }
}
