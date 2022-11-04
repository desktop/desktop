import mem from 'mem'
import QuickLRU from 'quick-lru'

// Initializing a date formatter is expensive but formatting is relatively cheap
// so we cache them based on the locale and their options. The maxSize of a 100
// is only as an escape hatch, we don't expect to ever create more than a
// handful different formatters.
const getDateFormatter = mem(Intl.DateTimeFormat, {
  cache: new QuickLRU({ maxSize: 100 }),
  cacheKey: (...args) => JSON.stringify(args),
})

/**
 * Format a date in en-US locale, customizable with Intl.DateTimeFormatOptions.
 *
 * See Intl.DateTimeFormat for more information
 */
export const formatDate = (date: Date, options: Intl.DateTimeFormatOptions) =>
  isNaN(date.valueOf())
    ? 'Invalid date'
    : getDateFormatter('en-US', options).format(date)
