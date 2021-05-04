import { ReleaseNote } from '../models/release-notes'
import { Dispatcher } from '../ui/dispatcher'
import {
  generateReleaseSummary,
  getChangeLog,
  getReleaseSummary,
} from './release-notes'

/**
 * Compares locally stored version and user of last thank you to currently
 * login in user and version
 */
export function hasUserAlreadyBeenCheckedOrThanked(
  lastThankYou: ReadonlyArray<string>,
  login: string,
  currentVersion: string
): boolean {
  if (lastThankYou.length === 0) {
    return false
  }

  const lastVersion = lastThankYou[0]
  const checkedUsers = lastThankYou.slice(1)
  return checkedUsers.includes(login) && lastVersion === currentVersion
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

export async function getThankYouByUser(): Promise<
  Map<string, ReadonlyArray<ReleaseNote>>
> {
  const releaseMetaData = await getChangeLog()
  const summaries = releaseMetaData.map(getReleaseSummary)
  const thankYousByUser = new Map<string, Array<ReleaseNote>>()

  summaries.forEach(s => {
    if (s.thankYous.length === 0) {
      return
    }

    const thanksRE = /\.\sThanks\s@.+!/i
    s.thankYous.forEach(ty => {
      const match = thanksRE.exec(ty.message)
      if (match === null) {
        return
      }

      const userHandle = match[0].slice(10, -1)
      let usersThanksYous = thankYousByUser.get(userHandle)
      if (usersThanksYous === undefined) {
        usersThanksYous = [ty]
      } else {
        usersThanksYous.push(ty)
      }
      thankYousByUser.set(userHandle, usersThanksYous)
    })
  })

  return thankYousByUser
}

export async function getUserContributions(
  lastThankYou: ReadonlyArray<string>,
  login: string
): Promise<ReadonlyArray<ReleaseNote> | null> {
  if (lastThankYou.length === 0 || !lastThankYou.slice(1).includes(login)) {
    const allThankYous = await getThankYouByUser()
    const byLogin = allThankYous.get(login)
    return byLogin !== undefined ? byLogin : null
  }

  const { thankYous } = await generateReleaseSummary()
  const userContributions = thankYous.filter(ty => ty.message.includes(login))

  return userContributions.length > 0 ? userContributions : null
}
