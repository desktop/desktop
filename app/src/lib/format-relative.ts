import { getDefaultRelativeTimeFormatter } from './get-intl-formatter'

export function formatRelative(ms: number) {
  const formatter = getDefaultRelativeTimeFormatter({ numeric: 'auto' })
  const sign = ms < 0 ? 1 : -1

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
