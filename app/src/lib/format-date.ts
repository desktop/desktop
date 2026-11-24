import { format } from 'date-fns'
import {
  getDateFormatPreference,
  getTimeFormatPreference,
} from '../models/formatting-preferences'

interface IFormatDateOptions {
  /** Whether to include the date portion. Defaults to true. */
  readonly date?: boolean
  /** Whether to include the time portion. Defaults to true. */
  readonly time?: boolean
}

/**
 * Format a date using the user's preferred date and time format patterns.
 *
 * By default both date and time are included. Pass `{ date: false }` or
 * `{ time: false }` to include only one.
 */
export function formatDate(
  value: Date,
  { date = true, time = true }: IFormatDateOptions = {}
): string {
  if (isNaN(value.valueOf())) {
    return 'Invalid date'
  }

  let formatString: string

  if (date && time) {
    formatString = `${getDateFormatPreference()} ${getTimeFormatPreference()}`
  } else if (date) {
    formatString = getDateFormatPreference()
  } else if (time) {
    formatString = getTimeFormatPreference()
  } else {
    // If neither date nor time is included, just return an empty string or
    // else date-fns will throw because it doesn't know what to do with the
    // format string
    return ''
  }

  try {
    return format(value, formatString)
  } catch (e) {
    // In case the user has configured an invalid format pattern, we don't want
    // the app to crash, let's fall back to a default format and log the error
    // so we can investigate.
    log.error(`Error formatting date with format string "${formatString}"`, e)

    return value.toISOString()
  }
}
