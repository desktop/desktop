import { ILastThankYou } from '../models/last-thank-you'
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
  lastThankYou: ILastThankYou | undefined,
  login: string,
  currentVersion: string
): boolean {
  if (lastThankYou === undefined) {
    return false
  }

  const { version, checkedUsers } = lastThankYou
  return checkedUsers.includes(login) && version === currentVersion
}

/** Updates the local storage of version and users that have been checked for
 * external contributions. We do this regardless of contributions so that
 * we don't keep pinging for release notes. */
export function updateLastThankYou(
  dispatcher: Dispatcher,
  lastThankYou: ILastThankYou | undefined,
  login: string,
  currentVersion: string
): void {
  const newCheckedUsers = [login]
  // If new version, clear out last versions checked users.
  const lastCheckedUsers =
    lastThankYou === undefined || lastThankYou.version !== currentVersion
      ? []
      : lastThankYou.checkedUsers

  const updatedLastThankYou = {
    version: currentVersion,
    checkedUsers: [...lastCheckedUsers, ...newCheckedUsers],
  }

  dispatcher.setLastThankYou(updatedLastThankYou)
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
  lastThankYou: ILastThankYou | undefined,
  login: string
): Promise<ReadonlyArray<ReleaseNote> | null> {
  if (
    lastThankYou === undefined ||
    !lastThankYou.checkedUsers.includes(login)
  ) {
    const allThankYous = await getThankYouByUser()
    const byLogin = allThankYous.get(login)
    return byLogin !== undefined ? byLogin : null
  }

  const { thankYous } = await generateReleaseSummary()
  const userContributions = thankYous.filter(ty => ty.message.includes(login))

  return userContributions.length > 0 ? userContributions : null
}
