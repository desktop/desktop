import { getFileHash } from '../file-system'
import { TokenStore } from '../stores'
import {
  getSSHSecretStoreKey,
  keepSSHSecretToStore,
} from './ssh-secret-storage'

const SSHKeyPassphraseTokenStoreKey = getSSHSecretStoreKey(
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
    keepSSHSecretToStore(
      operationGUID,
      SSHKeyPassphraseTokenStoreKey,
      keyHash,
      passphrase
    )
  } catch (e) {
    log.error('Could not store passphrase for SSH key:', e)
  }
}
