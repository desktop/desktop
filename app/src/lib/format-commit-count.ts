import { formatCount } from './format-count'

/**
 * Returns a string used for communicating a quantity of commits in a human-
 * readable, pluralized format (i.e '1 commit', '2 commits')
 */
export const formatCommitCount = (numberOfCommits: number) =>
  formatCount(numberOfCommits, 'commit')
