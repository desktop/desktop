import mem from 'mem'
import QuickLRU from 'quick-lru'
import { getFormattingLocales } from './formatting-locale'

// Initializing a number formatter is expensive but formatting is relatively
// cheap so we cache them based on the locale and their options. The maxSize of
// a 100 is only as an escape hatch, we don't expect to ever create more than a
// handful different formatters.
const getNumber = mem(
  (locale: string | string[], options?: Intl.NumberFormatOptions) => {
    try {
      return new Intl.NumberFormat(locale, options)
    } catch (e) {
      log.error(`Error creating NumberFormat with locale '${locale}'`, e)
      return new Intl.NumberFormat(undefined, options)
    }
  },
  {
    cache: new QuickLRU({ maxSize: 100 }),
    cacheKey: (...args) => JSON.stringify(args),
  }
)

/**
 * Format a date in the user's formatting locale, customizable with
 * Intl.NumberFormatOptions.
 *
 * See Intl.NumberFormat for more information
 */
export const formatNumber = (num: number, options?: Intl.NumberFormatOptions) =>
  getNumber(getFormattingLocales(), options).format(num)

/** Shorthand for formatNumber(x, { style: 'percent' }) */
export const formatPercent = (
  num: number,
  options?: Omit<Intl.NumberFormatOptions, 'style'>
) => formatNumber(num, { ...options, style: 'percent' })
