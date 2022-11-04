const units = {
  year: 31536000000,
  years: 31536000000,
  day: 86400000,
  days: 86400000,
  hour: 3600000,
  hours: 3600000,
  minute: 60000,
  minutes: 60000,
  second: 1000,
  seconds: 1000,
}

type Unit = keyof typeof units

/**
 * Returns milliseconds since the epoch offset from the current time by the
 * given amount.
 */
export const offsetFromNow = (value: number, unit: Unit): number =>
  offsetFrom(Date.now(), value, unit)

type Dateish = Date | number

/**
 * Returns milliseconds since the epoch offset by the given amount from the
 * given time (in milliseconds)
 */
export function offsetFrom(time: number, value: number, unit: Unit): number
/**
 * Returns a date object offset by the given amount from the given time
 */
export function offsetFrom(date: Date, value: number, unit: Unit): Date
export function offsetFrom(date: Dateish, value: number, unit: Unit): Dateish {
  const t = date.valueOf() + value * units[unit]
  return typeof date === 'number' ? t : new Date(t)
}
