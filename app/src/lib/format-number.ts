import { getDefaultNumberFormatter } from './get-intl-formatter'

/**
 * Format a date in the user's formatting locale, customizable with
 * Intl.NumberFormatOptions.
 *
 * See Intl.NumberFormat for more information
 */
export const formatNumber = (num: number, options?: Intl.NumberFormatOptions) =>
  getDefaultNumberFormatter(options).format(num)
