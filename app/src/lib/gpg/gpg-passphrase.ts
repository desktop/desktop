import { createHash } from 'crypto'
import { TokenStore } from '../stores'
import {
  getSSHCredentialStoreKey,
  setMostRecentSSHCredential,
  setSSHCredential,
} from '../ssh/ssh-credential-storage'

const GPGPassphraseTokenStoreKey = getSSHCredentialStoreKey('GPG passphrases')

async function getHashForGPGKey(keyId: string) {
  // Hash the GPG key ID to use as a storage key
  return createHash('sha256').update(keyId).digest('hex')
}

/** Retrieves the passphrase for the GPG key with the given ID. */
export async function getGPGPassphrase(keyId: string): Promise<string | null>
export async function getGPGPassphrase(
  token: string,
  keyId: string
): Promise<string | null>
export async function getGPGPassphrase(
  keyIdOrToken: string,
  keyId?: string
): Promise<string | null> {
  try {
    if (keyId !== undefined) {
      // Two-parameter form: getGPGPassphrase(token, keyId)
      const tokenKeyCombo = `${keyIdOrToken}:${keyId}`
      const keyHash = await getHashForGPGKey(tokenKeyCombo)
      return TokenStore.getItem(GPGPassphraseTokenStoreKey, keyHash)
    } else {
      // Single-parameter form: getGPGPassphrase(keyId)
      const keyHash = await getHashForGPGKey(keyIdOrToken)
      return TokenStore.getItem(GPGPassphraseTokenStoreKey, keyHash)
    }
  } catch (e) {
    log.error('Could not retrieve passphrase for GPG key:', e)
    return null
  }
}

/**
 * Stores the GPG key passphrase.
 *
 * @param operationGUID A unique identifier for the ongoing git operation. In
 *                      practice, it will always be the trampoline token for the
 *                      ongoing git operation.
 * @param keyId         ID of the GPG key.
 * @param passphrase    Passphrase for the GPG key.
 */
export async function setGPGPassphrase(
  operationGUID: string,
  keyId: string,
  passphrase: string
) {
  try {
    // For special tokens like 'temp-retry-token', include the token in the key
    const storageKey = operationGUID.startsWith('temp-')
      ? `${operationGUID}:${keyId}`
      : keyId
    const keyHash = await getHashForGPGKey(storageKey)

    await setSSHCredential(
      operationGUID,
      GPGPassphraseTokenStoreKey,
      keyHash,
      passphrase
    )
  } catch (e) {
    log.error('Could not store passphrase for GPG key:', e)
  }
}

/**
 * Keeps the GPG credential details in memory to be deleted later if the ongoing
 * git operation fails to authenticate.
 *
 * @param operationGUID A unique identifier for the ongoing git operation. In
 *                      practice, it will always be the trampoline secret for the
 *                      ongoing git operation.
 * @param keyId         ID of the GPG key.
 */
export async function setMostRecentGPGPassphrase(
  operationGUID: string,
  keyId: string
) {
  try {
    const keyHash = await getHashForGPGKey(keyId)

    setMostRecentSSHCredential(
      operationGUID,
      GPGPassphraseTokenStoreKey,
      keyHash
    )
  } catch (e) {
    log.error('Could not store passphrase for GPG key:', e)
  }
}
