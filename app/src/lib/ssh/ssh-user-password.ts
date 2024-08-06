import { TokenStore } from '../stores'
import {
  getSSHCredentialStoreKey,
  setMostRecentSSHCredential,
  setSSHCredential,
} from './ssh-credential-storage'

const SSHUserPasswordTokenStoreKey =
  getSSHCredentialStoreKey('SSH user password')

/** Retrieves the password for the given SSH username. */
export async function getSSHUserPassword(username: string) {
  try {
    return TokenStore.getItem(SSHUserPasswordTokenStoreKey, username)
  } catch (e) {
    log.error('Could not retrieve passphrase for SSH key:', e)
    return null
  }
}

/**
 * Stores the SSH user password.
 *
 * @param operationGUID A unique identifier for the ongoing git operation. In
 *                      practice, it will always be the trampoline token for the
 *                      ongoing git operation.
 * @param username      SSH user name. Usually in the form of `user@hostname`.
 * @param password      Password for the given user.
 */
export async function setSSHUserPassword(
  operationGUID: string,
  username: string,
  password: string
) {
  await setSSHCredential(
    operationGUID,
    SSHUserPasswordTokenStoreKey,
    username,
    password
  )
}

/**
 * Keeps the SSH credential details in memory to be deleted later if the ongoing
 * git operation fails to authenticate.
 *
 * @param operationGUID A unique identifier for the ongoing git operation. In
 *                      practice, it will always be the trampoline secret for the
 *                      ongoing git operation.
 * @param username      SSH user name.
 */
export function setMostRecentSSHUserPassword(
  operationGUID: string,
  username: string
) {
  setMostRecentSSHCredential(
    operationGUID,
    SSHUserPasswordTokenStoreKey,
    username
  )
}
