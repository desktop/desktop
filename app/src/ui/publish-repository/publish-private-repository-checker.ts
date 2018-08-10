import { IAPIUserWithPlan } from '../../lib/api'
import { Account } from '../../models/account'

export function canCreatePrivateRepo(
  userAccount: Account,
  targetOrg?: IAPIUserWithPlan | null
): boolean {
  if (targetOrg == null) {
    return userAccount.plan != null && userAccount.plan.name !== 'free'
  } else {
    return (
      targetOrg.plan != null &&
      targetOrg.plan.name !== 'free' &&
      targetOrg.members_can_create_repositories === true
    )
  }
}
