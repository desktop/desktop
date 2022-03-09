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

/** Converts the given value and time unit to milliseconds */
export const toMilliseconds = (value: number, unit: keyof typeof units) =>
  value * units[unit]
