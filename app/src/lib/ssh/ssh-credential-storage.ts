import { TokenStore } from '../stores'

const appName = __DEV__ ? 'GitHub Desktop Dev' : 'GitHub Desktop'

export function getSSHCredentialStoreKey(name: string) {
  return `${appName} - ${name}`
}

type SSHCredentialEntry = {
  /** Store where this entry is stored. */
  store: string

  /** Key used to identify the credential in the store (e.g. username or hash). */
  key: string
}

/**
 * This map contains the SSH credentials that are pending to be stored. What this
 * means is that a git operation is currently in progress, and the user wanted
 * to store the passphrase for the SSH key, however we don't want to store it
 * until we know the git operation finished successfully.
 */
const mostRecentSSHCredentials = new Map<string, SSHCredentialEntry>()

/**
 * Stores an SSH credential and also keeps it in memory to be deleted later if
 * the ongoing git operation fails to authenticate.
 *
 * @param operationGUID A unique identifier for the ongoing git operation. In
 *                      practice, it will always be the trampoline token for the
 *                      ongoing git operation.
 * @param store         Store where the SSH credential is stored.
 * @param key           Key that identifies the SSH credential (e.g. username or
 *                      key hash).
 * @param password      Password for the SSH key / user.
 */
export async function setSSHCredential(
  operationGUID: string,
  store: string,
  key: string,
  password: string
) {
  setMostRecentSSHCredential(operationGUID, store, key)
  await TokenStore.setItem(store, key, password)
}

/**
 * Keeps the SSH credential details in memory to be deleted later if the ongoing
 * git operation fails to authenticate.
 *
 * @param operationGUID A unique identifier for the ongoing git operation. In
 *                      practice, it will always be the trampoline token for the
 *                      ongoing git operation.
 * @param store         Store where the SSH credential is stored.
 * @param key           Key that identifies the SSH credential (e.g. username or
 *                      key hash).
 */
export function setMostRecentSSHCredential(
  operationGUID: string,
  store: string,
  key: string
) {
  mostRecentSSHCredentials.set(operationGUID, { store, key })
}

/**
 * Removes the SSH credential from memory. This must be used after a git
 * operation finished, regardless the result.
 */
export function removeMostRecentSSHCredential(operationGUID: string) {
  mostRecentSSHCredentials.delete(operationGUID)
}

/**
 * Deletes the SSH credential from the TokenStore. Used when the git operation
 * fails to authenticate.
 */
export async function deleteMostRecentSSHCredential(operationGUID: string) {
  const entry = mostRecentSSHCredentials.get(operationGUID)
  if (entry) {
    log.info(
      `SSH auth failed, deleting credential for ${entry.store}:${entry.key}`
    )

    await TokenStore.deleteItem(entry.store, entry.key)
  }
}
