import { getKeyForEndpoint } from '../auth'
import {
  getSSHKeyPassphrase,
  keepSSHKeyPassphraseToStore,
} from '../ssh/ssh-key-passphrase'
import { TokenStore } from '../stores'
import { TrampolineCommandHandler } from './trampoline-command'
import { trampolineUIHelper } from './trampoline-ui-helper'

async function handleSSHHostAuthenticity(
  prompt: string
): Promise<'yes' | 'no' | undefined> {
  const promptRegex = /^The authenticity of host '([^ ]+) \(([^\)]+)\)' can't be established.\nRSA key fingerprint is ([^.]+).\nAre you sure you want to continue connecting \(yes\/no\/\[fingerprint\]\)\? $/

  const matches = promptRegex.exec(prompt)
  if (matches === null || matches.length < 4) {
    return undefined
  }

  const host = matches[1]
  const ip = matches[2]
  const fingerprint = matches[3]

  // We'll accept github.com as valid host automatically. GitHub's public key
  // fingerprint can be obtained from
  // https://docs.github.com/en/github/authenticating-to-github/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints
  if (
    host === 'github.com' &&
    fingerprint === 'SHA256:nThbg6kXUpJWGl7E1IGOCspRomTxdCARLviKw6E5SY8'
  ) {
    return 'yes'
  }

  const addHost = await trampolineUIHelper.promptAddingSSHHost(
    host,
    ip,
    fingerprint
  )
  return addHost ? 'yes' : 'no'
}

async function handleSSHKeyPassphrase(
  operationGUID: string,
  prompt: string
): Promise<string | undefined> {
  const promptRegex = /^Enter passphrase for key '(.+)': $/

  const matches = promptRegex.exec(prompt)
  if (matches === null || matches.length < 2) {
    return undefined
  }

  let keyPath = matches[1]

  // The ssh bundled with Desktop on Windows, for some reason, provides Unix-like
  // paths for the keys (e.g. /c/Users/.../id_rsa). We need to convert them to
  // Windows-like paths (e.g. C:\Users\...\id_rsa).
  if (__WIN32__ && /^\/\w\//.test(keyPath)) {
    const driveLetter = keyPath[1]
    keyPath = keyPath.slice(2)
    keyPath = `${driveLetter}:${keyPath}`
  }

  const storedPassphrase = await getSSHKeyPassphrase(keyPath)
  if (storedPassphrase !== null) {
    return storedPassphrase
  }

  const {
    passphrase,
    storePassphrase,
  } = await trampolineUIHelper.promptSSHKeyPassphrase(keyPath)

  if (passphrase !== undefined && storePassphrase) {
    keepSSHKeyPassphraseToStore(operationGUID, keyPath, passphrase)
  }

  return passphrase ?? ''
}

export const askpassTrampolineHandler: TrampolineCommandHandler = async command => {
  if (command.parameters.length !== 1) {
    return undefined
  }

  const firstParameter = command.parameters[0]

  if (firstParameter.startsWith('The authenticity of host ')) {
    return handleSSHHostAuthenticity(firstParameter)
  }

  if (firstParameter.startsWith('Enter passphrase for key ')) {
    return handleSSHKeyPassphrase(command.trampolineToken, firstParameter)
  }

  const username = command.environmentVariables.get('DESKTOP_USERNAME')
  if (username === undefined || username.length === 0) {
    return undefined
  }

  if (firstParameter.startsWith('Username')) {
    return username
  } else if (firstParameter.startsWith('Password')) {
    const endpoint = command.environmentVariables.get('DESKTOP_ENDPOINT')
    if (endpoint === undefined || endpoint.length === 0) {
      return undefined
    }

    const key = getKeyForEndpoint(endpoint)
    const token = await TokenStore.getItem(key, username)
    return token ?? undefined
  }

  return undefined
}
