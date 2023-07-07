import { getDefaultDateTimeFormatter } from './get-intl-formatter'

/**
 * Format a date in the user's formatting locale customizable with
 * Intl.DateTimeFormatOptions.
 *
 * See Intl.DateTimeFormat for more information
 */
export const formatDate = (date: Date, options: Intl.DateTimeFormatOptions) =>
  isNaN(date.valueOf())
    ? 'Invalid date'
    : getDefaultDateTimeFormatter(options).format(date)
