import { spawn } from 'child_process'
import { platform } from 'os'
import { Dispatcher } from './dispatcher/dispatcher'

export function openTerminal(fullPath: string, dispatcher: Dispatcher) {
  const currentPlatform = platform()
  let command = ''

  switch (currentPlatform) {
    case 'darwin': {
      command = ''
      break
    }
    case 'win32': {
      command = ''
      break
    }
  }

  return spawn(command)
}