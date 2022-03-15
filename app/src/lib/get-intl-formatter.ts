import mem from 'mem'
import QuickLRU from 'quick-lru'
import { getFormattingLocales } from './formatting-locale'

type Locales = string | string[] | undefined

function createIntlFormatter<T, Opts>(
  formatter: { new (locales?: Locales, options?: Opts): T },
  locales?: string | string[],
  options?: Opts
): T {
  try {
    return new formatter(locales, options)
  } catch (e) {
    log.error(`Error creating DateTimeFormat with locale '${locales}'`, e)
    return new formatter(undefined, options)
  }
}

// Initializing an Intl formatter is expensive but formatting is relatively
// cheap so we cache them based on the locale and their options. The maxSize of
// a 100 is only as an escape hatch, we don't expect to ever create more than a
// handful different formatters.
export const getIntlFormatter = mem(createIntlFormatter, {
  cache: new QuickLRU({ maxSize: 100 }),
  cacheKey: (...args) => JSON.stringify(args),
})

export const getDefaultDateTimeFormatter = (
  opts?: Intl.DateTimeFormatOptions
) => getIntlFormatter(Intl.DateTimeFormat, getFormattingLocales(), opts)

export const getDefaultRelativeTimeFormatter = (
  opts?: Intl.RelativeTimeFormatOptions
) => getIntlFormatter(Intl.RelativeTimeFormat, getFormattingLocales(), opts)

export const getDefaultNumberFormatter = (opts?: Intl.NumberFormatOptions) =>
  getIntlFormatter(Intl.NumberFormat, getFormattingLocales(), opts)
