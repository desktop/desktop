import { ILastThankYou } from '../models/last-thank-you'
import { ReleaseNote } from '../models/release-notes'
import { Dispatcher } from '../ui/dispatcher'
import { getChangeLog, getReleaseSummary } from './release-notes'

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

export async function getThankYouByUser(
  isOnlyLastRelease: boolean
): Promise<Map<string, ReadonlyArray<ReleaseNote>>> {
  // 250 is more than total number beta release to date (5/5/2021) and the
  // purpose of getting more is to retroactively thank contributors to date.
  let releaseMetaData = await getChangeLog(250)
  if (isOnlyLastRelease) {
    releaseMetaData = releaseMetaData.slice(0, 1)
  }
  const summaries = releaseMetaData.map(getReleaseSummary)
  const thankYousByUser = new Map<string, Array<ReleaseNote>>()

  summaries.forEach(s => {
    if (s.thankYous.length === 0) {
      return
    }

    // This assumes the thank you is of the form that the draft-release notes generates:
    // [type] some release note. Thanks @user_handle!
    // Tho not sure if even allowed, if a user had a `!` in their user name,
    // we would not get the thank them also we could erroneously thank someone if
    // the `. Thanks @someusername!` was elsewhere in the message. Both,
    // those scenarios are low risk tho enough to not try to mitigate.
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
  isOnlyLastRelease: boolean,
  login: string
): Promise<ReadonlyArray<ReleaseNote> | null> {
  const allThankYous = await getThankYouByUser(isOnlyLastRelease)
  const byLogin = allThankYous.get(login)
  return byLogin !== undefined ? byLogin : null
}
