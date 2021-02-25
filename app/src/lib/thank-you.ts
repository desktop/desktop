import { Dispatcher } from '../ui/dispatcher'

/**
 * Compares locally stored version and user of last thank you to currently
 * login in user and version
 */
export function hasUserAlreadyBeenCheckedOrThanked(
  lastThankYou: ReadonlyArray<string>,
  dotComLogin: string,
  currentVersion: string
): boolean {
  if (lastThankYou.length === 0) {
    return false
  }

  const lastVersion = lastThankYou[0]
  const checkedUsers = lastThankYou.slice(1)

  return checkedUsers.includes(dotComLogin) && lastVersion === currentVersion
}

/** Updates the local storage of version and users that have been checked for
 * external contributions. We do this regardless of contributions so that
 * we don't keep pinging for release notes. */
export function updateLastThankYou(
  dispatcher: Dispatcher,
  lastThankYou: ReadonlyArray<string>,
  dotComLogin: string,
  currentVersion: string
): void {
  const lastVersion = lastThankYou[0]
  // If new version, clear out last version users.
  const checkedUsers =
    lastVersion !== currentVersion ? [] : lastThankYou.slice(1)
  checkedUsers.push(dotComLogin)
  const updatedLastThankYou = [currentVersion, ...checkedUsers]
  dispatcher.setVersionAndUsersOfLastThankYou(updatedLastThankYou)
}
