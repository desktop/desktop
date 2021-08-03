import { getKeyForEndpoint } from '../auth'
import { TokenStore } from '../stores'
import { TrampolineCommandHandler } from './trampoline-command'
import { trampolineUIHelper } from './trampoline-ui-helper'

export const askpassTrampolineHandler: TrampolineCommandHandler = async command => {
  if (command.parameters.length !== 1) {
    return undefined
  }

  if (command.parameters[0].startsWith('The authenticity of host ')) {
    const addHost = await trampolineUIHelper.promptAddingSSHHost(
      command.parameters[0]
    )
    return addHost ? 'yes' : 'no'
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
