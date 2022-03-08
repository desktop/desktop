export const units: [string, number][] = [
  ['day', 86400000],
  ['hour', 3600000],
  ['minute', 60000],
  ['second', 1000],
]

type DurationStyle = 'narrow' | 'long'

export const formatDuration = (duration: number, style: DurationStyle) =>
  units
    .reduce((parts, [u, ms]) => {
      if (parts.length > 0 || duration >= ms) {
        const qty = Math.floor(duration / ms)
        duration -= qty * ms
        parts.push(`${qty}${style === 'narrow' ? u[0] : u}`)
      }
      return parts
    }, new Array<string>())
    .join(' ')
