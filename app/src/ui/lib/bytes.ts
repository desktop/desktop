import { round } from './round'

/**
 * Number sign display mode
 */
export const enum Sign {
  Normal,
  Forced,
}

/**
 * Display bytes in human readable format like:
 *    23GB
 *   -43B
 * It's also possible to force sign in order to get the
 * plus sign in case of positive numbers like:
 *   +23GB
 *   -43B
 */
export const formatBytes = (
  bytes: number,
  signType: Sign = Sign.Normal,
  decimals = 0
) => {
  if (!Number.isFinite(bytes)) {
    return 'Unknown'
  }
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const sizeIndex = Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024))
  const sign = signType === Sign.Forced && bytes > 0 ? '+' : ''
  const value = round(bytes / Math.pow(1024, sizeIndex), decimals)
  return `${sign}${value} ${sizes[sizeIndex]}`
}
