import { parse } from 'bcp-47'

export const defaultFormattingLocale = 'en-US'
let formattingLocale: string | undefined = undefined

/**
 * Get the current user localle or undefined if not set or invalid
 */
export const getFormattingLocale = () =>
  formattingLocale ?? defaultFormattingLocale

/**
 * Get the current user locale with a fallack to the default locale if they
 * differ.
 */
export const getFormattingLocales = () =>
  formattingLocale && formattingLocale !== defaultFormattingLocale
    ? [formattingLocale, defaultFormattingLocale]
    : defaultFormattingLocale

/**
 * Set the current user locale. Note that we will only use the region part
 * of the locale, the language will always be 'en'.
 *
 * @param locale A BCP 47 formatted tag (i.e "en-US"). POSIX-style en_US is
 *               supported on a best-effort basis
 */
export const setFormattingLocale = (locale: string | undefined) => {
  if (locale === undefined) {
    formattingLocale = undefined
  } else {
    const { region } = parse(locale.replaceAll('_', '-'), { forgiving: true })

    if (typeof region !== 'string') {
      throw new Error(`Could not parse locale: ${locale}`)
    }

    formattingLocale = `en-${region.toUpperCase() ?? 'US'}`
  }
}
