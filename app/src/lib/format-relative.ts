import mem from 'mem'
import QuickLRU from 'quick-lru'

// Initializing a date formatter is expensive but formatting is relatively cheap
// so we cache them based on the locale and their options. The maxSize of a 100
// is only as an escape hatch, we don't expect to ever create more than a
// handful different formatters.
const getRelativeFormatter = mem(
  (locale: string, options: Intl.RelativeTimeFormatOptions) =>
    new Intl.RelativeTimeFormat(locale, options),
  {
    cache: new QuickLRU({ maxSize: 100 }),
    cacheKey: (...args) => JSON.stringify(args),
  }
)

export function formatRelative(ms: number) {
  const formatter = getRelativeFormatter('en-US', { numeric: 'auto' })

  const sign = ms < 0 ? -1 : 1

  // Lifted and adopted from
  // https://github.com/github/time-elements/blob/428b02c9/src/relative-time.ts#L57
  const sec = Math.round(Math.abs(ms) / 1000)
  const min = Math.round(sec / 60)
  const hr = Math.round(min / 60)
  const day = Math.round(hr / 24)
  const month = Math.round(day / 30)
  const year = Math.round(month / 12)

  if (sec < 45) {
    return formatter.format(sec * sign, 'second')
  } else if (min < 45) {
    return formatter.format(min * sign, 'minute')
  } else if (hr < 24) {
    return formatter.format(hr * sign, 'hour')
  } else if (day < 30) {
    return formatter.format(day * sign, 'day')
  } else if (month < 18) {
    return formatter.format(month * sign, 'month')
  } else {
    return formatter.format(year * sign, 'year')
  }
}
