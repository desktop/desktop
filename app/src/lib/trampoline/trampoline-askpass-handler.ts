import { getKeyForEndpoint } from '../auth'
import {
  getSSHKeyPassphrase,
  keepSSHKeyPassphraseToStore,
} from '../ssh/ssh-key-passphrase'
import { AccountsStore, TokenStore } from '../stores'
import {
  ITrampolineCommand,
  TrampolineCommandHandler,
} from './trampoline-command'
import { trampolineUIHelper } from './trampoline-ui-helper'
import { parseAddSSHHostPrompt } from '../ssh/ssh'
import {
  getSSHUserPassword,
  keepSSHUserPasswordToStore,
} from '../ssh/ssh-user-password'
import { removePendingSSHSecretToStore } from '../ssh/ssh-secret-storage'
import { getHTMLURL } from '../api'
import {
  getGenericHostname,
  getGenericUsername,
  setGenericPassword,
  setGenericUsername,
} from '../generic-git-auth'
import { Account } from '../../models/account'
import {
  getHasRejectedCredentialsForEndpoint,
  getIsBackgroundTaskEnvironment,
  setHasRejectedCredentialsForEndpoint,
  setMostRecentGenericGitCredential,
} from './trampoline-environment'
import { IGitAccount } from '../../models/git-account'

async function handleSSHHostAuthenticity(
  prompt: string
): Promise<'yes' | 'no' | undefined> {
  const info = parseAddSSHHostPrompt(prompt)

  if (info === null) {
    return undefined
  }

  // We'll accept github.com as valid host automatically. GitHub's public key
  // fingerprint can be obtained from
  // https://docs.github.com/en/github/authenticating-to-github/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints
  if (
    info.host === 'github.com' &&
    info.keyType === 'RSA' &&
    info.fingerprint === 'SHA256:nThbg6kXUpJWGl7E1IGOCspRomTxdCARLviKw6E5SY8'
  ) {
    return 'yes'
  }

  const addHost = await trampolineUIHelper.promptAddingSSHHost(
    info.host,
    info.ip,
    info.keyType,
    info.fingerprint
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

  const { secret: passphrase, storeSecret: storePassphrase } =
    await trampolineUIHelper.promptSSHKeyPassphrase(keyPath)

  // If the user wanted us to remember the passphrase, we'll keep it around to
  // store it later if the git operation succeeds.
  // However, when running a git command, it's possible that the user will need
  // to enter the passphrase multiple times if there are failed attempts.
  // Because of that, we need to remove any pending passphrases to be stored
  // when, in one of those multiple attempts, the user chooses NOT to remember
  // the passphrase.
  if (passphrase !== undefined && storePassphrase) {
    keepSSHKeyPassphraseToStore(operationGUID, keyPath, passphrase)
  } else {
    removePendingSSHSecretToStore(operationGUID)
  }

  return passphrase ?? ''
}

async function handleSSHUserPassword(operationGUID: string, prompt: string) {
  const promptRegex = /^(.+@.+)'s password: $/

  const matches = promptRegex.exec(prompt)
  if (matches === null || matches.length < 2) {
    return undefined
  }

  const username = matches[1]

  const storedPassword = await getSSHUserPassword(username)
  if (storedPassword !== null) {
    return storedPassword
  }

  const { secret: password, storeSecret: storePassword } =
    await trampolineUIHelper.promptSSHUserPassword(username)

  if (password !== undefined && storePassword) {
    keepSSHUserPasswordToStore(operationGUID, username, password)
  } else {
    removePendingSSHSecretToStore(operationGUID)
  }

  return password ?? ''
}

export const createAskpassTrampolineHandler: (
  accountsStore: AccountsStore
) => TrampolineCommandHandler =
  (accountsStore: AccountsStore) => async command => {
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

    if (firstParameter.endsWith("'s password: ")) {
      return handleSSHUserPassword(command.trampolineToken, firstParameter)
    }

    // Git prompt: Username for 'https://github.com':
    // Git LFS prompt: Username for "https://github.com"
    const credsMatch = /^(Username|Password) for ['"](.+)['"](: )?$/.exec(
      firstParameter
    )

    if (credsMatch?.[1] === 'Username' || credsMatch?.[1] === 'Password') {
      const [, kind, remoteUrl] = credsMatch
      return handleAskPassUserPassword(command, kind, remoteUrl, accountsStore)
    }

    return undefined
  }

const handleAskPassUserPassword = async (
  command: ITrampolineCommand,
  kind: 'Username' | 'Password',
  remoteUrl: string,
  accountsStore: AccountsStore
) => {
  const info = (msg: string) => log.info(`askPassHandler: ${msg}`)
  const debug = (msg: string) => log.debug(`askPassHandler: ${msg}`)
  const warn = (msg: string) => log.warn(`askPassHandler: ${msg}`)

  const { trampolineToken } = command
  const hostname = getGenericHostname(remoteUrl)
  const account = await findAccount(trampolineToken, accountsStore, hostname)

  if (!account) {
    if (getHasRejectedCredentialsForEndpoint(trampolineToken, hostname)) {
      debug(`not requesting credentials for ${hostname}`)
      return undefined
    }

    if (getIsBackgroundTaskEnvironment(trampolineToken)) {
      debug('background task environment, skipping prompt')
      return undefined
    }

    info(`no account found for ${hostname}`)

    if (hostname === 'github.com') {
      // We don't want to show a generic auth prompt for GitHub.com and we
      // don't have a good way to turn the sign in flow into a promise. More
      // specifically we can create a promise that resolves when the GH sign in
      // flow completes but we don't have a way to have the promise reject if
      // the user cancels.
      return undefined
    }

    const { username, password } =
      await trampolineUIHelper.promptForGenericGitAuthentication(hostname)

    if (username.length > 0 && password.length > 0) {
      setGenericUsername(hostname, username)
      await setGenericPassword(hostname, username, password)

      info(`acquired generic credentials for ${hostname}`)

      return kind === 'Username' ? username : password
    } else {
      info('user cancelled generic git authentication')
      setHasRejectedCredentialsForEndpoint(trampolineToken, hostname)
    }

    return undefined
  } else {
    const accountKind = account instanceof Account ? 'account' : 'generic'
    if (kind === 'Username') {
      debug(`${accountKind} username for ${hostname} found`)
      return account.login
    } else if (kind === 'Password') {
      const token =
        account instanceof Account && account.token.length > 0
          ? account.token
          : await TokenStore.getItem(
              getKeyForEndpoint(account.endpoint),
              account.login
            )

      if (token) {
        debug(`${accountKind} password for ${hostname} found`)
      } else {
        // We have a username but no password, that warrants a warning
        warn(`${accountKind} password for ${hostname} missing`)
      }

      return token ?? undefined
    }
  }

  return undefined
}

async function findAccount(
  trampolineToken: string,
  accountsStore: AccountsStore,
  hostname: string
): Promise<IGitAccount | undefined> {
  const accounts = await accountsStore.getAll()
  const account = accounts.find(
    a => new URL(getHTMLURL(a.endpoint)).hostname === hostname
  )

  if (account) {
    return account
  }

  const login = getGenericUsername(hostname)

  if (hostname && login) {
    setMostRecentGenericGitCredential(trampolineToken, hostname, login)
    return { login, endpoint: hostname }
  }

  return undefined
}
