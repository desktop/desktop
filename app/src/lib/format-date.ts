import mem from 'mem'
import QuickLRU from 'quick-lru'
import { getFormattingLocales } from './formatting-locale'

// Initializing a date formatter is expensive but formatting is relatively cheap
// so we cache them based on the locale and their options. The maxSize of a 100
// is only as an escape hatch, we don't expect to ever create more than a
// handful different formatters.
const getDateFormatter = mem(
  (locale: string | string[], options: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat(locale, options)
    } catch (e) {
      log.error(`Error creating DateTimeFormat with locale '${locale}'`, e)
      return new Intl.DateTimeFormat(undefined, options)
    }
  },
  {
    cache: new QuickLRU({ maxSize: 100 }),
    cacheKey: (...args) => JSON.stringify(args),
  }
)

/**
 * Format a date in the user's formatting locale customizable with
 * Intl.DateTimeFormatOptions.
 *
 * See Intl.DateTimeFormat for more information
 */
export const formatDate = (date: Date, options: Intl.DateTimeFormatOptions) =>
  isNaN(date.valueOf())
    ? 'Invalid date'
    : getDateFormatter(getFormattingLocales(), options).format(date)
