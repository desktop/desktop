import { round } from './round'

const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB']

/**
 * Display bytes in human readable format like:
 *    23 GiB
 *   -43 B
 * It's also possible to force sign in order to get the
 * plus sign in case of positive numbers like:
 *   +23 GiB
 *   -43 B
 */
export function formatBytes(bytes: number, decimals = 0, includeSign = false) {
  if (!Number.isFinite(bytes)) {
    return 'Unknown'
  }
  const sizeIndex = Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024))
  const sign = includeSign && bytes > 0 ? '+' : ''
  const value = round(bytes / Math.pow(1024, sizeIndex), decimals)
  return `${sign}${value} ${units[sizeIndex]}`
}
