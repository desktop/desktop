import { formatNumber } from './format-number'

/**
 * Returns a string used for communicating a quantity of commits in a human-
 * readable, pluralized format (i.e '1 commit', '2 commits')
 *
 * @param numberOfCommits The number of commits that will be pushed
 * @param unit            A string written in such a way that without
 *                        modification it can be paired with the digit 1
 *                        such as 'commit' and which, when a 's' is appended
 *                        to it can be paired with a zero digit or a number
 *                        greater than one.
 */
export const formatCommitCount = (numberOfCommits: number, unit = 'commit') =>
  `${formatNumber(numberOfCommits)} ${unit}${numberOfCommits === 1 ? '' : 's'}`
