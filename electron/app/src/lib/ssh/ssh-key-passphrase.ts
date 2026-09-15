import { getFileHash } from '../get-file-hash'
import { TokenStore } from '../stores'
import {
  getSSHCredentialStoreKey,
  setMostRecentSSHCredential,
  setSSHCredential,
} from './ssh-credential-storage'

const SSHKeyPassphraseTokenStoreKey = getSSHCredentialStoreKey(
  'SSH key passphrases'
)

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

/**
 * Stores the SSH key passphrase.
 *
 * @param operationGUID A unique identifier for the ongoing git operation. In
 *                      practice, it will always be the trampoline token for the
 *                      ongoing git operation.
 * @param keyPath       Path to the SSH key.
 * @param passphrase    Passphrase for the SSH key.
 */
export async function setSSHKeyPassphrase(
  operationGUID: string,
  keyPath: string,
  passphrase: string
) {
  try {
    const keyHash = await getHashForSSHKey(keyPath)

    await setSSHCredential(
      operationGUID,
      SSHKeyPassphraseTokenStoreKey,
      keyHash,
      passphrase
    )
  } catch (e) {
    log.error('Could not store passphrase for SSH key:', e)
  }
}

/**
 * Keeps the SSH credential details in memory to be deleted later if the ongoing
 * git operation fails to authenticate.
 *
 * @param operationGUID A unique identifier for the ongoing git operation. In
 *                      practice, it will always be the trampoline secret for the
 *                      ongoing git operation.
 * @param keyPath       Path of the SSH key.
 */
export async function setMostRecentSSHKeyPassphrase(
  operationGUID: string,
  keyPath: string
) {
  try {
    const keyHash = await getHashForSSHKey(keyPath)

    setMostRecentSSHCredential(
      operationGUID,
      SSHKeyPassphraseTokenStoreKey,
      keyHash
    )
  } catch (e) {
    log.error('Could not store passphrase for SSH key:', e)
  }
}
