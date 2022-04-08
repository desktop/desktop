export const units: [string, number][] = [
  ['d', 86400000],
  ['h', 3600000],
  ['m', 60000],
  ['s', 1000],
]

/**
 * Creates a narrow style precise duration format used for displaying things
 * like check run durations that typically only last for a few minutes.
 *
 * Example: formatPreciseDuration(3670000) -> "1h 1m 10s"
 *
 * @param ms The duration in milliseconds
 */
export const formatPreciseDuration = (ms: number) => {
  const parts = new Array<string>()
  ms = Math.abs(ms)

  for (const [unit, value] of units) {
    if (parts.length > 0 || ms >= value || unit === 's') {
      const qty = Math.floor(ms / value)
      ms -= qty * value
      parts.push(`${qty}${unit}`)
    }
  }

  return parts.join(' ')
}
