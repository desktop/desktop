import { getFileHash } from '../file-system'
import { TokenStore } from '../stores'

const appName = __DEV__ ? 'GitHub Desktop Dev' : 'GitHub Desktop'
const SSHKeyPassphraseTokenStoreKey = `${appName} - SSH key passphrases`

async function getHashForSSHKey(keyPath: string) {
  return getFileHash(keyPath, 'sha256')
}

/** Retrieves the passphrase for the SSH key in the given path. */
export async function getSSHKeyPassphrase(keyPath: string) {
  try {
    const fileHash = await getHashForSSHKey(keyPath)
    return TokenStore.getItem(SSHKeyPassphraseTokenStoreKey, fileHash)
  } catch (e) {
    log.error('Could not retrieve passphrase for SSH key:', e)
    return null
  }
}

type SSHKeyPassphraseEntry = {
  /** Hash of the SSH key file. */
  keyHash: string

  /** Passphrase for the SSH key. */
  passphrase: string
}

/**
 * This map contains the SSH key passphrases that are pending to be stored.
 * What this means is that a git operation is currently in progress, and the
 * user wanted to store the passphrase for the SSH key, however we don't want
 * to store it until we know the git operation finished successfully.
 */
const SSHKeyPassphrasesToStore = new Map<string, SSHKeyPassphraseEntry>()

/**
 * Keeps the SSH key passphrase in memory to be stored later if the ongoing git
 * operation succeeds.
 *
 * @param operationGUID A unique identifier for the ongoing git operation. In
 *                      practice, it will always be the trampoline token for the
 *                      ongoing git operation.
 * @param keyPath       Path to the SSH key.
 * @param passphrase    Passphrase for the SSH key.
 */
export async function keepSSHKeyPassphraseToStore(
  operationGUID: string,
  keyPath: string,
  passphrase: string
) {
  try {
    const keyHash = await getHashForSSHKey(keyPath)
    SSHKeyPassphrasesToStore.set(operationGUID, { keyHash, passphrase })
  } catch (e) {
    log.error('Could not store passphrase for SSH key:', e)
  }
}

/** Removes the SSH key passphrase from memory. */
export function removePendingSSHKeyPassphraseToStore(operationGUID: string) {
  SSHKeyPassphrasesToStore.delete(operationGUID)
}

/** Stores a pending SSH key passphrase if the operation succeeded. */
export async function storePendingSSHKeyPassphrase(operationGUID: string) {
  const entry = SSHKeyPassphrasesToStore.get(operationGUID)
  if (entry === undefined) {
    return
  }

  await TokenStore.setItem(
    SSHKeyPassphraseTokenStoreKey,
    entry.keyHash,
    entry.passphrase
  )
}
