import { assertNever } from './fatal-error'

type Unit = 'year' | 'day' | 'hour' | 'minute' | 'second'
type Plural = `${Unit}s`

export function toMilliseconds(value: 1, unit: Unit): number
export function toMilliseconds(value: number, unit: Plural): number
export function toMilliseconds(value: number, unit: Unit | Plural): number {
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
