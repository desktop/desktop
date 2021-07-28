import { getKeyForEndpoint } from '../auth'
import { TokenStore } from '../stores'
import { TrampolineCommandHandler } from './trampoline-command'

export const askpassTrampolineHandler: TrampolineCommandHandler = async command => {
  if (command.parameters.length !== 1) {
    return undefined
  }

  if (command.parameters[0].startsWith('The authenticity of host ')) {
    // FIXME: actually ask the user what to do with the host
    return 'yes'
  }

  const username = command.environmentVariables.get('DESKTOP_USERNAME')
  if (username === undefined || username.length === 0) {
    return undefined
  }

  if (command.parameters[0].startsWith('Username')) {
    return username
  } else if (command.parameters[0].startsWith('Password')) {
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
