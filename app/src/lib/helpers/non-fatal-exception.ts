/**
 * Send a caught (ie. non-fatal) exception to the non-fatal error bucket
 *
 * The intended use of this message is for getting insight into areas of the
 * code where we suspect alternate failure modes other than those accounted for.
 *
 * Example: In the Desktop tutorial creation logic we handle all errors and our
 * initial belief was that the only two failure modes we would have to account
 * for were either the repo existing on disk or on the user's account. We now
 * suspect that there might be other reasons why the creation logic is failing
 * and therefore want to send all errors encountered during creation to central
 * where we can determine if there are additional failure modes for us to
 * consider.
 *
 * @param kind - a grouping key that allows us to group all errors originating
 * in the same area of the code base or relating to the same kind of failure
 * (recommend a single non-hyphenated word) Example: tutorialRepoCreation
 *
 * @param error - the caught error
 */

import { getHasOptedOutOfStats } from '../stats/stats-store'

let lastNonFatalException: number | undefined = undefined

/** Max one non fatal exeception per minute */
const minIntervalBetweenNonFatalExceptions = 60 * 1000

export type ExceptionKinds =
  | 'invalidListSelection'
  | 'TooManyPopups'
  | 'remoteNameMismatch'
  | 'tutorialRepoCreation'
  | 'multiCommitOperation'
  | 'PullRequestState'
  | 'trampolineCommandParser'
  | 'trampolineServer'
  | 'PopupNoId'
  | 'FailedToStartPullRequest'
  | 'unhandledRejection'
  | 'rebaseConflictsWithBranchAlreadyUpToDate'
  | 'forkCreation'
  | 'NoSuggestedActionsProvided'

export function sendNonFatalException(kind: ExceptionKinds, error: Error) {
  if (getHasOptedOutOfStats()) {
    return
  }

  const now = Date.now()

  if (
    lastNonFatalException !== undefined &&
    now - lastNonFatalException < minIntervalBetweenNonFatalExceptions
  ) {
    return
  }

  lastNonFatalException = now
  process.emit('send-non-fatal-exception', error, { kind })
}
