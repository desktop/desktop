import { TokenStore } from '../stores'

const appName = __DEV__ ? 'GitHub Desktop Dev' : 'GitHub Desktop'

export function getSSHSecretStoreKey(name: string) {
  return `${appName} - ${name}`
}

type SSHCredentialEntry = {
  /** Store where this entry is stored. */
  store: string

  /** Key used to identify the secret in the store (e.g. username or hash). */
  key: string
}

/**
 * This map contains the SSH secrets that are pending to be stored. What this
 * means is that a git operation is currently in progress, and the user wanted
 * to store the passphrase for the SSH key, however we don't want to store it
 * until we know the git operation finished successfully.
 */
const mostRecentSSHCredentials = new Map<string, SSHCredentialEntry>()

/**
 * Keeps the SSH secret in memory to be deleted later if the ongoing git operation
 * fails to authenticate.
 *
 * @param operationGUID A unique identifier for the ongoing git operation. In
 *                      practice, it will always be the trampoline secret for the
 *                      ongoing git operation.
 * @param key           Key that identifies the SSH secret (e.g. username or key
 *                      hash).
 */
export async function setMostRecentSSHCredential(
  operationGUID: string,
  store: string,
  key: string
) {
  mostRecentSSHCredentials.set(operationGUID, { store, key })
}

/** Removes the SSH key passphrase from memory. */
export function removeMostRecentSSHCredential(operationGUID: string) {
  mostRecentSSHCredentials.delete(operationGUID)
}

export async function deleteMostRecentSSHCredential(operationGUID: string) {
  const entry = mostRecentSSHCredentials.get(operationGUID)
  if (entry) {
    log.info(`SSH auth failed, deleting credential for ${entry.store}:${entry.key}`)

    await TokenStore.deleteItem(entry.store, entry.key)
  }
}
