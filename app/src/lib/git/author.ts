import { Repository } from '../../models/repository'
import { Account } from '../../models/account'
import { setGlobalConfigValue } from './config'
import { lookupPreferredEmail } from '../email'

/**
 * Update git author configuration globally to match the given account.
 * This sets user.name and user.email in the global git config.
 */
export async function updateGitAuthorForAccount(
  repository: Repository,
  account: Account
): Promise<void> {
  const name = account.name || account.login
  const email = lookupPreferredEmail(account)
  
  // Update global git config so it applies to all repositories
  await setGlobalConfigValue('user.name', name)
  await setGlobalConfigValue('user.email', email)
}
