import { formatNumber } from './format-number'

/**
 * Returns a string used for communicating a count in a human-readable,
 * pluralized format (i.e '1 commit', '2 commits')
 *
 * @param count           The number 'units'
 * @param unit            A string written in such a way that without
 *                        modification it can be paired with the digit 1 such as
 *                        'commit' and which, when a 's' is appended to it can
 *                        be paired with a zero digit or a number greater than
 *                        one.
 */
export const formatCount = (count: number, unit: string) =>
  `${formatNumber(count)} ${unit}${count === 1 ? '' : 's'}`
