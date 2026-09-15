import { format } from 'date-fns'
import {
  getDateFormatPreference,
  getTimeFormatPreference,
} from '../models/formatting-preferences'
import { enableFormattingPreferences } from './feature-flag'
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

interface IFormatDateOptions {
  /** Whether to include the date portion. Defaults to true. */
  readonly date?: boolean
  /** Whether to include the time portion. Defaults to true. */
  readonly time?: boolean

  /**
   * @deprecated Will be removed in a future release. Temporarily supported for
   *             backward compatibility with existing code when
   *             enableFormattingPreferences is disabled. As soon as formatting
   *             preferences is shipped to production, this option will be
   *             removed.
   */
  readonly dateStyle?: 'full' | 'long' | 'medium' | 'short'

  /**
   * @deprecated Will be removed in a future release. Temporarily supported for
   *             backward compatibility with existing code when
   *             enableFormattingPreferences is disabled. As soon as formatting
   *             preferences is shipped to production, this option will be
   *             removed.
   */
  readonly timeStyle?: 'full' | 'long' | 'medium' | 'short'
}

/**
 * Format a date using the user's preferred date and time format patterns.
 *
 * By default both date and time are included. Pass `{ date: false }` or
 * `{ time: false }` to include only one.
 */
export function formatDate(
  value: Date,
  { date = true, time = true, dateStyle, timeStyle }: IFormatDateOptions = {}
): string {
  if (isNaN(value.valueOf())) {
    return 'Invalid date'
  }

  if (!enableFormattingPreferences()) {
    return getDateFormatter('en-US', { dateStyle, timeStyle }).format(value)
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
