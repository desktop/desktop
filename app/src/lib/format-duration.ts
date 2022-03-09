export const units: [string, number][] = [
  ['day', 86400000],
  ['hour', 3600000],
  ['minute', 60000],
  ['second', 1000],
]

type DurationStyle = 'narrow' | 'long'

export const formatDuration = (duration: number, style: DurationStyle) => {
  const parts = new Array<string>()

  for (const [unit, value] of units) {
    if (parts.length > 0 || duration >= value) {
      const qty = Math.floor(duration / value)
      duration -= qty * value
      parts.push(`${qty}${style === 'narrow' ? unit[0] : unit}`)
    }
  }

  return parts.join(' ')
}
