import { formatCompactNumber } from '../../lib/format-number'

const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB']

/**
 * Formats a number of bytes into a human readable string.
 *
 * This method will uses the IEC representation for orders
 * of magnitude (KiB/MiB rather than MB/KB) in order to match
 * the format that Git uses.
 *
 * Example output:
 *
 *    23 GiB
 *   -43 B
 *
 * @param bytes       - The number of bytes to reformat into human
 *                      readable form
 * @param decimals    - The number of decimals to round the result
 *                      to, defaults to zero
 */
export function formatBytes(bytes: number, decimals = 0) {
  return formatCompactNumber(bytes, {
    base: 1024,
    units,
    decimals,
    unitSeparator: ' ',
  })
}
