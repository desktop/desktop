import { TokenStore } from '../stores'

const appName = __DEV__ ? 'GitHub Desktop Dev' : 'GitHub Desktop'

export function getSSHSecretStoreKey(name: string) {
  return `${appName} - ${name}`
}

type SSHSecretEntry = {
  /** Store where this entry will be stored. */
  store: string

  /** Key used to identify the secret in the store (e.g. username or hash). */
  key: string

  /** Actual secret to be stored (password). */
  secret: string
}

/**
 * This map contains the SSH secrets that are pending to be stored. What this
 * means is that a git operation is currently in progress, and the user wanted
 * to store the passphrase for the SSH key, however we don't want to store it
 * until we know the git operation finished successfully.
 */
const SSHSecretsToStore = new Map<string, SSHSecretEntry>()

/**
 * Keeps the SSH secret in memory to be stored later if the ongoing git operation
 * succeeds.
 *
 * @param operationGUID A unique identifier for the ongoing git operation. In
 *                      practice, it will always be the trampoline secret for the
 *                      ongoing git operation.
 * @param key           Key that identifies the SSH secret (e.g. username or key
 *                      hash).
 * @param secret        Actual SSH secret to store.
 */
export async function keepSSHSecretToStore(
  operationGUID: string,
  store: string,
  key: string,
  secret: string
) {
  SSHSecretsToStore.set(operationGUID, { store, key, secret })
}

/** Removes the SSH key passphrase from memory. */
export function removePendingSSHSecretToStore(operationGUID: string) {
  SSHSecretsToStore.delete(operationGUID)
}

/** Stores a pending SSH key passphrase if the operation succeeded. */
export async function storePendingSSHSecret(operationGUID: string) {
  const entry = SSHSecretsToStore.get(operationGUID)
  if (entry === undefined) {
    return
  }

  await TokenStore.setItem(entry.store, entry.key, entry.secret)
}
