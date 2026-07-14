import {
  getNumberFormatPreference,
  INumberFormat,
} from '../models/formatting-preferences'
import { round } from '../ui/lib/round'
import { enableFormattingPreferences } from './feature-flag'

/**
 * Format a number using the given separator configuration.
 *
 * This is a simple formatter that handles integer and decimal parts with
 * configurable separators. It does not use Intl.NumberFormat.
 *
 * @param value - The number to format
 * @param fmt   - The number format configuration with thousands and decimal
 *                separators, defaults to the user's preferred format.
 */
export function formatNumber(value: number, fmt?: INumberFormat): string {
  if (!fmt && !enableFormattingPreferences()) {
    return value.toString()
  }

  fmt ??= getNumberFormatPreference()

  if (!Number.isFinite(value)) {
    return String(value)
  }

  const isNegative = value < 0
  const abs = Math.abs(value)
  const [intPart, decPart] = abs.toString().split('.')

  // Insert a placeholder character for thousands groupings, then replace with
  // the configured separator. The regex matches positions that are followed by
  // groups of exactly 3 digits.
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '\x00')
  const formattedInt = grouped.replace(/\x00/g, fmt.thousandsSeparator)

  const result =
    decPart !== undefined
      ? `${formattedInt}${fmt.decimalSeparator}${decPart}`
      : formattedInt

  return isNegative ? `-${result}` : result
}

interface ICompactFormatOptions {
  /** Number of decimal places to display */
  readonly decimals?: number
  /**
   * The base to use for unit scaling.
   * - 1000: SI/decimal units (k, m, b, t or KB, MB, GB)
   * - 1024: IEC/binary units (KiB, MiB, GiB)
   */
  readonly base?: 1000 | 1024
  /**
   * Custom unit suffixes to use. If not provided, defaults to:
   * - For base 1000: ['', 'k', 'm', 'b', 't']
   * - For base 1024: no default (must be provided)
   */
  readonly units?: ReadonlyArray<string>
  /**
   * Whether to add a space between the number and the unit suffix.
   * Defaults to false for the shorthand k/m/b/t units.
   */
  readonly unitSeparator?: string

  readonly numberFormat?: INumberFormat
}

const defaultDecimalUnits = ['', 'k', 'm', 'b', 't']

export function formatCompactNumber(
  value: number,
  fmt?: ICompactFormatOptions
): string {
  if (!fmt && !enableFormattingPreferences()) {
    return `${value}`
  }

  if (!Number.isFinite(value)) {
    return `${value}`
  }

  const abs = Math.abs(value)
  const base = fmt?.base ?? 1000
  const units = fmt?.units ?? defaultDecimalUnits
  const unitSeparator = fmt?.unitSeparator ?? ''

  if (abs < base) {
    const result = formatNumber(value, fmt?.numberFormat)
    // For byte formatting, always show units even for small values
    return units[0] ? `${result}${unitSeparator}${units[0]}` : result
  }

  const unitIx = Math.min(
    units.length - 1,
    Math.floor(Math.log(abs) / Math.log(base))
  )

  const scaled = value / Math.pow(base, unitIx)

  // If the user didn't provide an explicit number of decimals to use, we'll
  // default to 1 decimal for numbers less than 10 and no decimals for numbers
  // 10 or greater. This is a common convention for compact number formatting
  // that balances precision with brevity.
  const decimals = fmt?.decimals ?? (Math.abs(scaled) < 10 ? 1 : 0)

  const result = round(scaled, decimals)
  return `${formatNumber(result, fmt?.numberFormat)}${unitSeparator}${
    units[unitIx]
  }`
}
