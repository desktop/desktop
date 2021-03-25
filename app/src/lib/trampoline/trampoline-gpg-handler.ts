import { API } from '../api'
import { getKeyForEndpoint } from '../auth'
import { TokenStore } from '../stores/token-store'
import { TrampolineCommandHandler } from './trampoline-command'

export const gpgTrampolineHandler: TrampolineCommandHandler = async command => {
  if (command.parameters === ['--status-fd=2', '-bsau']) {
    return undefined
  }

  const username = command.environmentVariables.get('DESKTOP_USERNAME')
  if (username === undefined || username.length === 0) {
    return undefined
  }

  const endpoint = command.environmentVariables.get('DESKTOP_ENDPOINT')
  if (endpoint === undefined || endpoint.length === 0) {
    return undefined
  }

  const key = getKeyForEndpoint(endpoint)
  const token = await TokenStore.getItem(key, username)

  if (token === null || token.length === 0) {
    return undefined
  }

  const message = command.stdin
  if (message === undefined) {
    return undefined
  }

  const api = new API(endpoint, token)

  try {
    const result = await api.commitSign(message)

    if (result === null) {
      return undefined
    }

    return {
      stdout: result.signature,
      stderr: '[GNUPG:] BEGIN_SIGNING\n[GNUPG:] SIG_CREATED \n',
    }
  } catch {
    return undefined
  }
}
