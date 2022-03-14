import mem from 'mem'
import QuickLRU from 'quick-lru'
import { parse } from 'bcp-47'

const defaultLocale = 'en-US'
let dateLocale: string | undefined = undefined

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

export const setDateLocale = (locale: string | undefined) => {
  if (locale === undefined) {
    dateLocale = undefined
    return
  }

  try {
    const { region } = parse(locale.replaceAll('_', '-'), { forgiving: true })
    if (region === undefined) {
      dateLocale = undefined
      log.error(`Failed setting date formatting locale from ${locale}`)
    } else {
      dateLocale = `en-${region ?? 'US'}`
      log.info(`Set date formatting locale to ${dateLocale}`)
    }
  } catch (e) {
    log.error(`Failed setting date locale`, e)
  }
}
