import mem from 'mem'
import QuickLRU from 'quick-lru'
import { getFormattingLocales } from './formatting-locale'

type Locales = string | string[]

function createIntlFormatter<Formatter, Opts>(
  formatter: { new (locales?: Locales, options?: Opts): Formatter },
  locales?: Locales,
  options?: Opts
) {
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
  cacheKey: ({ name }, ...args) => JSON.stringify([name, ...args]),
})

const factory = <T, O>(f: { new (l?: Locales, o?: O): T }) => (opts?: O) =>
  getIntlFormatter(f, getFormattingLocales(), opts)

export const getDefaultDateTimeFormatter = factory(Intl.DateTimeFormat)
export const getDefaultRelativeTimeFormatter = factory(Intl.RelativeTimeFormat)
export const getDefaultNumberFormatter = factory(Intl.NumberFormat)
