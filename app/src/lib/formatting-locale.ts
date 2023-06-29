export const defaultFormattingLocale = 'en-US-POSIX'
let formattingLocale: string | undefined = undefined

/**
 * Get the current user locale or undefined if not set or invalid
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
 * Set the current user locale. Note that the language will always be 'en'.
 *
 * @param countryCode The user's locale region as a ISO 3166 country code
 */
export const setFormattingLocaleFromCountryCode = (countryCode: string) => {
  if (!/^[a-z]{2}$/i.test(countryCode)) {
    throw new Error(`Could not parse region '${countryCode}'`)
  }

  formattingLocale = `en-${countryCode.toUpperCase()}`
}
