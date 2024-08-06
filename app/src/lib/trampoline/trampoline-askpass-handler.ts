import {
  getSSHKeyPassphrase,
  setMostRecentSSHKeyPassphrase,
  setSSHKeyPassphrase,
} from '../ssh/ssh-key-passphrase'
import { AccountsStore } from '../stores/accounts-store'
import {
  ITrampolineCommand,
  TrampolineCommandHandler,
} from './trampoline-command'
import { trampolineUIHelper } from './trampoline-ui-helper'
import { parseAddSSHHostPrompt } from '../ssh/ssh'
import {
  getSSHUserPassword,
  setMostRecentSSHUserPassword,
  setSSHUserPassword,
} from '../ssh/ssh-user-password'
import { removeMostRecentSSHCredential } from '../ssh/ssh-credential-storage'
import { setGenericPassword, setGenericUsername } from '../generic-git-auth'
import { Account } from '../../models/account'
import {
  getHasRejectedCredentialsForEndpoint,
  getIsBackgroundTaskEnvironment,
  setHasRejectedCredentialsForEndpoint,
  setMostRecentGenericGitCredential,
} from './trampoline-environment'
import { urlWithoutCredentials } from './url-without-credentials'
import {
  findGenericTrampolineAccount,
  findGitHubTrampolineAccount,
} from './find-account'

async function handleSSHHostAuthenticity(
  operationGUID: string,
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

  if (getIsBackgroundTaskEnvironment(operationGUID)) {
    log.debug(
      'handleSSHHostAuthenticity: background task environment, skipping prompt'
    )
    return undefined
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
    // Keep this stored passphrase around in case it's not valid and we need to
    // delete it if the git operation fails to authenticate.
    await setMostRecentSSHKeyPassphrase(operationGUID, keyPath)
    return storedPassphrase
  }

  if (getIsBackgroundTaskEnvironment(operationGUID)) {
    log.debug(
      'handleSSHKeyPassphrase: background task environment, skipping prompt'
    )
    return undefined
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
    setSSHKeyPassphrase(operationGUID, keyPath, passphrase)
  } else {
    removeMostRecentSSHCredential(operationGUID)
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
    // Keep this stored password around in case it's not valid and we need to
    // delete it if the git operation fails to authenticate.
    setMostRecentSSHUserPassword(operationGUID, username)
    return storedPassword
  }

  if (getIsBackgroundTaskEnvironment(operationGUID)) {
    log.debug(
      'handleSSHUserPassword: background task environment, skipping prompt'
    )
    return undefined
  }

  const { secret: password, storeSecret: storePassword } =
    await trampolineUIHelper.promptSSHUserPassword(username)

  if (password !== undefined && storePassword) {
    setSSHUserPassword(operationGUID, username, password)
  } else {
    removeMostRecentSSHCredential(operationGUID)
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
      return handleSSHHostAuthenticity(command.trampolineToken, firstParameter)
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

  const { trampolineToken } = command
  const parsedUrl = new URL(remoteUrl)
  const endpoint = urlWithoutCredentials(remoteUrl)
  const account =
    (await findGitHubTrampolineAccount(accountsStore, remoteUrl)) ??
    (await findGenericTrampolineAccount(trampolineToken, remoteUrl).then(c => {
      if (c) {
        setMostRecentGenericGitCredential(trampolineToken, endpoint, c.login)
      }
      return c
    }))

  if (account) {
    const accountKind = account instanceof Account ? 'account' : 'generic'
    debug(`${accountKind} ${kind.toLowerCase()} for ${remoteUrl} found`)
    return kind === 'Username' ? account.login : account.token
  }

  if (getHasRejectedCredentialsForEndpoint(trampolineToken, endpoint)) {
    debug(`not requesting credentials for ${remoteUrl}`)
    return undefined
  }

  if (getIsBackgroundTaskEnvironment(trampolineToken)) {
    debug('background task environment, skipping prompt')
    return undefined
  }

  info(`no account found for ${remoteUrl}`)

  if (parsedUrl.hostname === 'github.com') {
    // We don't want to show a generic auth prompt for GitHub.com and we
    // don't have a good way to turn the sign in flow into a promise. More
    // specifically we can create a promise that resolves when the GH sign in
    // flow completes but we don't have a way to have the promise reject if
    // the user cancels.
    return undefined
  }

  const { login: username, token: password } =
    (await trampolineUIHelper.promptForGenericGitAuthentication(
      remoteUrl,
      parsedUrl.username === '' ? undefined : parsedUrl.username
    )) ?? { login: '', token: '' }

  if (!username || !password) {
    info('user cancelled generic git authentication')
    setHasRejectedCredentialsForEndpoint(trampolineToken, endpoint)

    return undefined
  }

  // Git will ordinarily prompt us twice, first for the username and then
  // for the password. For the second prompt the url will contain the
  // username. For example:
  // Prompt 1: Username for 'https://example.com':
  // < user enters username >
  // Prompt 2: Password for 'https://username@example.com':
  //
  // So when we get a prompt that doesn't include the username we know that
  // it's the first prompt. This matters because users can include the
  // username in the remote url in which case Git won't even prompt us for
  // the username. For example:
  // https://username@dev.azure.com/org/repo/_git/repo
  //
  // If we're getting prompted for password directly with the username we
  // don't want to store the username association, only the password.
  if (parsedUrl.username === '') {
    setGenericUsername(endpoint, username)
  }

  await setGenericPassword(endpoint, username, password)

  info(`acquired generic credentials for ${remoteUrl}`)

  return kind === 'Username' ? username : password
}
